var async = require('async'),
    nano = require('nano'),
    cluster = require('cluster'),
    fs = require('fs'),
    path = require('path'),
    http = require('http'),
    Module = require('module').Module,
    MeshApp = require('mesh').MeshApp,
    _ = require('underscore'),
    mappedApps = {},
    reProtected = /^\/[^\/]*\/(app\.js|lib|node_modules|resources|views)/i,
    reAttachmentUrl = /^\/([^\/]+)\/(.*)/,
    reValidStatus = /^[2-3]+/;
    

function _autoCreateDb(mesh, callback) {
    var couch = nano(mesh.config.couchurl);
    
    couch.db.get(mesh.config.meshdb, function(err) {
        if (err && err.error === 'not_found') {
            couch.db.create(mesh.config.meshdb, callback);
        }
        else if (callback) {
            callback(err);
        }
    });
};
    
function checkDirs(directory, callback) {
    var dirMode = 0x1FF;
    
    // check the existence of the requested directory
    path.exists(directory, function(exists) {
        if (! exists) {
            // check the existence of the parent directory
            path.exists(path.dirname(directory), function(parentExists) {
                // if the parent does not exist, then recurse up the tree
                if (! parentExists) {
                    checkDirs(path.dirname(directory), function() {
                        fs.mkdir(directory, dirMode, callback);
                    });
                }
                // otherwise, create the directory and fire the callback
                else {
                    fs.mkdir(directory, dirMode, callback);
                } // if..else
            });
        }
        else {
            callback();
        } // if..else
    });
} // checkDirs

function getConnection(mesh) {
    return nano(mesh.config.couchurl).use(mesh.config.meshdb);
} // getConnection

function getHandler(mesh, appId, handlerString) {
    var moduleName = handlerString.replace(reHandler, '$1'),
        fnName = handlerString.replace(reHandler, '$2'),
        modulePath = path.resolve('lib/apps/' + appId + '/lib/' + moduleName),
        handler = null;

    try {
        handler = require(modulePath)[fnName];
    }
    catch (e) {
        mesh.log.error('could not load handler for "' + handlerString + '"', e);
    } // try..catch
    
    return handler;
} // getHandler

/**
## loadApps
*/
exports.loadApps = function(mesh, callback, masterOverride) {
    var db = getConnection(mesh),
        isMaster = typeof masterOverride != 'undefined' ? masterOverride : cluster.isMaster;
        
    mesh.log.info('attempting to load apps from db: ' + mesh.config.couchurl + '/' + mesh.config.meshdb);
    
    function downloadApp(appData, appCallback) {
        var libs = appData.value.libs || [],
            attachmentsToDownload = libs.length;
        
        if (attachmentsToDownload > 0) {
            mesh.log.info('synchronizing application: ' + appData.key);

            // iterate through the libaries of the appdata
            libs.forEach(function(libname) {
                // define the attachment path and the local path
                var localFile = path.join(appData.path, libname);

                checkDirs(path.dirname(localFile), function() {
                    db.attachment.get(appData.id, libname, function(error, res) {
                        attachmentsToDownload -= 1;

                        if (! error) {
                            fs.writeFileSync(localFile, typeof res == 'object' ? JSON.stringify(res) : res);

                            // mesh.log.info('Updated ' + path.basename(attachment) + ' --> ' + path.basename(localFile));
                            if (attachmentsToDownload <= 0) {
                                appCallback();
                            } // if
                        }
                        else {
                            mesh.log.error('Unable to download attachment: ' + attachment);

                            if (attachmentsToDownload <= 0) {
                                appCallback();
                            } // if
                        }
                    }, { parseResponse: false });
                });
            });
        }
        else if (appCallback) {
            appCallback();
        }
    } // downloadLibrary
    
    _autoCreateDb(mesh, function() {
        db.view('default', 'apps', function(err, res) {
            var apps = [];

            if (err) {
                if (err && err.error === 'not_found') {
                    callback('Steelmesh database has not been initialized !{yellow}ENOINIT');
                }
                else {
                    callback('Unable to connect to steelmesh db (' + err.error + ')');
                }
            }
            else {
                // initialise the list of stack apps
                res.rows.forEach(function(appData) {
                    var appid = (appData.value || {}).id || appData.id,
                        appPath = path.resolve(__dirname, '../apps/' + appid);
                        
                    // initialise the local app path 
                    appData.path = path.resolve(__dirname, '../apps/', appid);
                    
                    // if the appData value contains a mount point, then map the app
                    if (appData.value.mountpoint) {
                        mappedApps[appData.value.mountpoint] = appData.id;
                    }
                    
                    // create the mesh app
                    apps.push(new MeshApp(appPath, _.extend({
                        id: appid,
                        title: appData.title,
                        baseUrl: '/' + appid + '/'
                    }, appData.value)));
                });

                // if we are the master process, then download applications
                if (isMaster) {
                    async.forEach(res.rows, downloadApp, function() {
                        mesh.log.info('synchronized application resources');
                        if (callback) {
                            callback(null, apps);
                        } // if
                    });
                }
                // otherwise, just fire the callback
                else if (callback) {
                    callback(null, apps);
                } // if..else
            } // if..else
        });
    });
}; // loadApps

exports.createResourceLoader = function(mesh) {
    var db = getConnection(mesh);

    return function(req, res, next) {
        var targetDoc = req.url.replace(/^(.*\/)$/, '$1index'),
            appid, match, docRequest, docRequestTimer,
            activeSocket,
            responseStarted = false,
            timedOut = false;
            
        // if the requested url is protected, then return a 404
        if (reProtected.test(req.url)) {
            res.send('Not found', 404);
        }
        else {
            // if the target document does not have an extension, then add .html by default
            targetDoc += path.extname(targetDoc) == '' ? '.html' : '';

            // see if the target doc matches the attachment url regex
            match = reAttachmentUrl.exec(targetDoc);

            if (match) {
                // get the mapped application id
                appid = mappedApps[match[1]] || match[1];

                // initialise the document request
                docRequest = db.attachment.get(appid, match[2]);
                // set the callback
                docRequest.callback = function(err, resp, body) {
                    responseStarted = true;
                    
                    if (! timedOut) {
                        // if we have a response and it is a valid response code, 
                        // then pipe the couch response directly to express
                        if (resp && reValidStatus.test(resp.statusCode)) {
                            docRequest.pipe(res);
                        }
                        // otherwise, defer to the next handler
                        else {
                            next();
                        }
                    }
                };

                docRequest.onResponse = true;
                docRequest.request();
                
                process.nextTick(function() {
                    docRequest.req.on('socket', function(socket) {
                        activeSocket = socket;
                    });
                    
                    docRequest.req.setTimeout(10000, function() {
                        if (! responseStarted) {
                            var logMessage = 'request for \'' + targetDoc + '\' timed out';
                            
                            if (activeSocket) {
                                logMessage += ', destroying active socket';
                                
                                // end and destroy the socket
                                activeSocket.end();
                                // activeSocket.destroy();
                            }
                            
                            // log the timeout
                            mesh.log.warn(logMessage);

                            // flag as timed out
                            timedOut = true;
                            res.send('Timed out: ' + new Date().getTime(), 500);
                        }
                    });
                });
            }
            else {
                next();
            }
        } // if..else        
    };
}; // loadResource
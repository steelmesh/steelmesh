var async = require('async'),
    nano = require('nano'),
    cluster = require('cluster'),
    events = require('events'),
    util = require('util'),
    fs = require('fs'),
    path = require('path'),
    http = require('http'),
    url = require('url'),
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
    
function CouchAppLoader() {
} // CouchAppLoader

util.inherits(CouchAppLoader, events.EventEmitter);

CouchAppLoader.prototype.init = function(mesh) {
    _autoCreateDb(mesh, function(err) {
        if (! err) {
            _loader.emit('ready');
        }
        else {
            // check the db again in 5 seconds
            setTimeout(function() {
                _loader.init(mesh);
            }, 5000);
        }
    });
};

CouchAppLoader.prototype.loadApps = function(mesh, callback, masterOverride) {
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
}; // loadApps

CouchAppLoader.prototype.createResourceLoader = function(mesh) {
    var baseUrl = mesh.config.couchurl + '/' + mesh.config.meshdb,
        resCache = {};

    return function(req, res, next) {
        var targetDoc = req.url.replace(/^(.*\/)$/, '$1index'),
            appid, match, docRequest, docRequestTimer,
            activeSocket, targetOptions,
            responseStarted = false,
            targetBuffer, bufferOffset = 0,
            timedOut = false;
            
        // if the target document does not have an extension, then add .html by default
        targetDoc += path.extname(targetDoc) == '' ? '.html' : '';
            
        // if the requested url is protected, then return a 404
        if (reProtected.test(targetDoc)) {
            res.send('Not found', 404);
        }
        else if (resCache[targetDoc]) {
            res.write(resCache[targetDoc]);
            res.end();
        }
        else {
            // see if the target doc matches the attachment url regex
            match = reAttachmentUrl.exec(targetDoc);

            if (match) {
                // get the mapped application id
                appid = mappedApps[match[1]] || match[1];
                targetOptions = url.parse(baseUrl + '/' + appid + '/' + match[2]);
                
                docRequest = http.get(targetOptions, function(couchRes) {
                    if (! timedOut) {
                        var headers = couchRes.headers,
                            contentLength = headers ? (headers['content-length'] || headers['Content-Length']) : 0;
                            
                        // initialise the response
                        responseStarted = true;
                        targetBuffer = new Buffer(parseInt(contentLength || 0, 10));
                        bufferOffset = 0;
                        
                        // handle data
                        couchRes.on('data', function(chunk) {
                            if (bufferOffset + chunk.length > targetBuffer.length) {
                                var newBuffer = new Buffer(bufferOffset + chunk.length);

                                targetBuffer.copy(newBuffer);
                                targetBuffer = newBuffer;
                            }
                            
                            // copy the target buffer chunk into the new buffer
                            chunk.copy(targetBuffer, bufferOffset);
                            
                            // increase the buffer offset by the chunk size
                            bufferOffset += chunk.length;
                            
                            // write the chunk to the output stream
                            res.write(chunk);
                        });
                        
                        // handle the response end
                        couchRes.on('end', function() {
                            // cache the buffer
                            resCache[targetDoc] = targetBuffer;
                            
                            // end the response
                            res.end();
                        });
                    }
                });
                
                docRequest.on('error', function(e) {
                    mesh.log.error('error requesting \'' + targetDoc + '\'', e);
                });
                
                docRequest.setSocketKeepAlive(false);
                docRequest.setTimeout(10000, function() {
                    if (! responseStarted) {
                        // flag as timed out
                        timedOut = true;

                        docRequest.abort();
                        mesh.log.warn('request for \'' + targetDoc + '\' timed out');
                        res.send('Timed out: ' + new Date().getTime(), 500);
                    }
                });
            }
            else {
                next();
            }
        } // if..else        
    };
}; // loadResource

var _loader = module.exports = new CouchAppLoader();
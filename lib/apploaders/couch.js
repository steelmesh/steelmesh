var async = require('async'),
    nano = require('nano'),
    fs = require('fs'),
    path = require('path'),
    Module = require('module').Module,
    MeshApp = require('mesh').MeshApp,
    _ = require('underscore'),
    reProtected = /^\/[^\/]*\/(app\.js|lib|node_modules|resources|views)/i;
    
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
        mesh.log('could not load handler for "' + handlerString + '"');
    } // try..catch
    
    return handler;
} // getHandler

/**
## loadApps
*/
exports.loadApps = function(mesh, callback) {
    var db = getConnection(mesh);
    
    function downloadApp(appData, appCallback) {
        var libs = appData.value.libs || [],
            attachmentsToDownload = libs.length;
        
        if (attachmentsToDownload > 0) {
            mesh.out('synchronizing application: ' + appData.key);

            // iterate through the libaries of the appdata
            libs.forEach(function(libname) {
                // define the attachment path and the local path
                var attachment = appData.id + '/' + libname,
                    localFile = path.resolve('lib/apps/' + attachment);

                checkDirs(path.dirname(localFile), function() {
                    db.attachment.get(appData.id, libname, function(error, res) {
                        attachmentsToDownload -= 1;

                        if (! error) {
                            fs.writeFileSync(localFile, res);

                            mesh.log('Updated ' + path.basename(attachment) + ' --> ' + path.basename(localFile));
                            if (attachmentsToDownload <= 0) {
                                appCallback();
                            } // if
                        }
                        else {
                            mesh.out('!{red}Unable to download attachment: {0}', attachment);

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
    
    // TODO: read apps into mesh apps
    // TODO: load routes from apps
    // TODO: load jobs from apps
    
    db.get('_design/default/_view/apps', function(error, res) {
        var apps = [];
        
        if (error) {
            mesh.out('!{red}Unable to find applications in couchdb');
            callback();
        }
        else {
            // initialise the list of stack apps
            res.rows.forEach(function(appData) {
                var appPath = path.resolve(__dirname, '../apps/' + appData.id);
                
                // create the mesh app
                apps.push(new MeshApp(appPath, _.extend({
                    id: appData.id,
                    title: appData.title,
                    baseUrl: '/' + appData.id + '/'
                }, appData.value)));
            });
            
            // if we are the master process, then download applications
            if (mesh.cluster.isMaster) {
                async.forEach(res.rows, downloadApp, function() {
                    mesh.out('synchronized application resources');
                    if (callback) {
                        callback(apps);
                    } // if
                });
            }
            // otherwise, just fire the callback
            else if (callback) {
                callback(apps);
            } // if..else
        } // if..else
    });
}; // loadApps

/**
## loadJobs
*/
exports.loadJobs = function(mesh, callback) {
    // ensure we have a callback
    callback = callback || function() {};
    
    var db = getConnection(mesh);
    
    function registerJob(jobRow, jobCallback) {
        var jobData = jobRow.value;
        
        // initialise the job data in the format mesh expects
        jobData.title = jobRow.key;
        jobData.run = getHandler(mesh, jobRow.id, jobData.handler);
        
        mesh.registerJob(jobData);
        jobCallback();
    } // registerJob
    
    console.log(db);
    
    db.view('default', 'jobs', function(error, res) {
        if (error) {
            mesh.out('!{red}Unable to load jobs from couchdb');
            callback();
        }
        else {
            async.forEach(res.rows, registerJob, function() {
                mesh.log('loaded ' + res.rows.length + ' jobs into steelmesh');
                callback();
            });
        } // if..else
    });    
}; // loadJobs

exports.loadResource = function(mesh, req, res, next) {
    // if the requested url is protected, then return a 404
    if (reProtected.test(req.url)) {
        res.send('Not found', 404);
    }
    else {
        var db = getConnection(mesh),
            targetDoc = req.url.replace(/^(.*\/)$/, '$1index');

        // if the target document does not have an extension, then add .html by default
        targetDoc += path.extname(targetDoc) == '' ? '.html' : '';
        db.get(targetDoc, function(error, result) {
            if (! error) {
                // get express to set the content type based on the requested resource
                res.contentType(targetDoc);

                // send the result
                res.send(result);
            }
            else {
                next();
                // res.send(result.reason || error, 404);
            } // if..else
        });
    } // if..else
}; // loadResource
var async = require('async'),
    comfy = require('comfy'),
    fs = require('fs'),
    path = require('path'),
    Module = require('module').Module,
    MeshApp = require('../meshapp').MeshApp;
    reHandler = /(.*)\.(.*)$/;
    
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
    return comfy.init({
        url: mesh.config.couchurl,
        db: mesh.config.appdb
    });
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
## findRoutes
This function is used to return the routes that have been registered in CouchDB 
for the various applications.
*/
exports.findRoutes = function(mesh, callback) {
    var couch = getConnection(mesh);
    
    function loadRoute(routeData, loadCallback) {
        var handler = (routeData.value.handler || '').replace(reHandler, '$1'),
            handlerFn = (routeData.value.handler || '').replace(reHandler, '$2'),
            isCoreModule = handler.toLowerCase() === 'core',
            modulePath, pathData, routeDetails,
            appPath = path.resolve(__dirname, '../apps/' + routeData.id);
            
        try {
            var module = require(path.join(appPath, 'lib', handler)),
                // FIXME: applications should only be loaded once...
                app = new MeshApp(appPath, {});
            
            routeDetails = {
                method: routeData.value.method || 'GET',
                path: routeData.key,
                handler: mesh.wrap(app, module[handlerFn])
            };

            if (module[handlerFn]) {
                mesh.emit('route', routeDetails);
            }
            else {
                mesh.log('Handler for path: ' + routeDetails.path + ' invalid');
            } // if..else
        }
        catch (e) {
            mesh.exception(e);
            mesh.log('error importing app module "' + modulePath + '": ' + e.message);
        } // try..catch
        
        loadCallback();
    } // loadRoute
    
    couch.get('_design/default/_view/routes', function(error, res) {
        if (! error) {
            async.forEachSeries(res.rows, loadRoute, callback || function() {});
        } // if
    });    
}; // findRoutes

/**
## loadApps
*/
exports.loadApps = function(mesh, callback) {
    var couch = getConnection(mesh);
    
    function downloadApp(appData, appCallback) {
        var attachmentsToDownload = (appData.value.libs || []).length;
        
        mesh.out('synchronizing application: ' + appData.key);
        
        // iterate through the libaries of the appdata
        (appData.value.libs || []).forEach(function(libname) {
            // define the attachment path and the local path
            var attachment = appData.id + '/' + libname,
                localFile = path.resolve('lib/apps/' + attachment);

            checkDirs(path.dirname(localFile), function() {
                couch.get(attachment, function(error, res) {
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
    } // downloadLibrary
    
    couch.get('_design/default/_view/apps', function(error, res) {
        if (error) {
            mesh.out('!{red}Unable to find applications in couchdb');
            callback();
        }
        else {
            // initialise the list of stack apps
            res.rows.forEach(function(appData) {
                mesh.apps.push({
                    id: appData.id,
                    title: appData.key || appData.id
                });
            });
            
            // if we are the master process, then download applications
            if (mesh.cluster.isMaster) {
                async.forEach(res.rows, downloadApp, function() {
                    mesh.out('synchronized application resources');
                    if (callback) {
                        callback();
                    } // if
                });
            }
            // otherwise, just fire the callback
            else if (callback) {
                callback();
            } // if..else
        } // if..else
    });
}; // loadApps

/**
## loadJobs
*/
exports.loadJobs = function(mesh, callback) {
    var couch = getConnection(mesh);
    
    function registerJob(jobRow, jobCallback) {
        var jobData = jobRow.value;
        
        // initialise the job data in the format mesh expects
        jobData.title = jobRow.key;
        jobData.run = getHandler(mesh, jobRow.id, jobData.handler);
        
        mesh.registerJob(jobData);
        jobCallback();
    } // registerJob
    
    couch.get('_design/default/_view/jobs', function(error, res) {
        if (error) {
            mesh.out('!{red}Unable to load jobs from couchdb');
            callback();
        }
        else {
            async.forEach(res.rows, registerJob, function() {
                mesh.log('loaded ' + res.rows.length + ' jobs into steelmesh');
                
                if (callback) {
                    callback();
                } // if
            });
        } // if..else
    });    
}; // loadJobs

exports.loadResource = function(mesh, req, res, next) {
    var couch = getConnection(mesh),
        targetDoc = req.url.replace(/^(.*\/)$/, '$1index');
        
    couch.get(targetDoc + '.html', function(error, result) {
        if (! error) {
            res.ok(result);
        }
        else {
            res.notFound(result.reason || error);
        } // if..else
    });
}; // loadResource
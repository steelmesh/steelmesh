var async = require('async'),
    comfy = require('comfy'),
    fs = require('fs'),
    path = require('path'),
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
    
    function loadRoute(routeData) {
        var handler = (routeData.value.handler || '').replace(reHandler, '$1'),
            handlerFn = (routeData.value.handler || '').replace(reHandler, '$2'),
            isCoreModule = routeData.value.coreHandler,
            modulePath;

        if (isCoreModule) {
            modulePath = '../' + handler;
        }
        else {
            modulePath =  path.resolve('lib/apps/' + routeData.id + '/lib/' + handler);
        } // if..else

        try {
            var module = require(modulePath),
                pathData = (routeData.key || '').split(':'),
                routeDetails = {
                    method: pathData.length > 1 ? pathData[0] : 'GET',
                    path: pathData.length > 1 ? pathData[1] : pathData[0],
                    handler: mesh.wrap(module[handlerFn])
                };

            if (module[handlerFn]) {
                mesh.emit('route', routeDetails);
            }
            else {
                mesh.log('Handler for path: ' + routeDetails.path + ' invalid');
            } // if..else
        }
        catch (e) {
            mesh.log('error importing app module "' + modulePath + '": ' + e.message);
        } // try..catch        
    } // loadRoute
    
    couch.get('_design/default/_view/routes', function(error, res) {
        if (! error) {
            async.forEach(res.rows, loadRoute, callback);
        } // if
    });    
}; // findRoutes

/**
## loadApps
*/
exports.loadApps = function(mesh, callback) {
    var couch = getConnection(mesh);
    
    function downloadApp(appData, appCallback) {
        mesh.log('synchronizing application: ' + appData.key);
        
        // iterate through the libaries of the appdata
        (appData.value.libs || []).forEach(function(libname) {
            // define the attachment path and the local path
            var attachment = appData.id + '/' + libname,
                localFile = path.resolve('lib/apps/' + attachment);

            checkDirs(path.dirname(localFile), function() {
                couch.get(attachment, function(error, res) {
                    if (! error) {
                        mesh.log('Updated application library: ' + localFile);
                        fs.writeFile(localFile, res, 'utf8', appCallback);
                    }
                    else {
                        mesh.out(('Unable to download attachment: ' + attachment).red);
                        appCallback();
                    }
                });
            });
        });
    } // downloadLibrary
    
    couch.get('_design/default/_view/apps', function(error, res) {
        if (error) {
            mesh.out('Unable to find applications in couchdb'.red);
            callback();
        }
        else {
            async.forEach(res.rows, downloadApp, callback);
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
            mesh.out('Unable to load jobs from couchdb'.red);
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
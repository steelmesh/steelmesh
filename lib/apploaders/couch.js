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

exports.findRoutes = function(mesh, callback) {
    var couch = comfy.init({ 
        url: mesh.config.couchurl, 
        db: mesh.config.appdb
    });
    
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

exports.loadApps = function(mesh, callback) {
    var couch = comfy.init({
        url: mesh.config.couchurl,
        db: mesh.config.appdb
    });
    
    function downloadLibrary(libData, callback) {
        // define the attachment path and the local path
        var attachment = libData.id + '/' + libData.key,
            localFile = path.resolve('lib/apps/' + attachment);
            
        checkDirs(path.dirname(localFile), function() {
            couch.get(attachment, function(error, res) {
                if (! error) {
                    mesh.log('Updated application library: ' + localFile);
                    fs.writeFile(localFile, res, 'utf8', callback);
                }
                else {
                    mesh.out(('Unable to download attachment: ' + attachment).red);
                    callback();
                }
            });
        });
    } // downloadLibrary
    
    couch.get('_design/default/_view/libs', function(error, res) {
        if (error) {
            mesh.out('Unable to find library dependencies from couchdb'.red);
            callback();
        }
        else {
            async.forEach(res.rows, downloadLibrary, callback);
        } // if..else
    });
}; // run
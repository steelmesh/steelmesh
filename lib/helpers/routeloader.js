/**
# Routeloader
*/

var routesView = '_design/default/_view/routes',
    reHandler = /(.*)\.(.*)$/,
    Module = require('module').Module,
    path = require('path'),
    loadedModules = {};
    
function loadModule(mesh, app, moduleName, callback) {
    var modulePath = '/' + app + '/' + moduleName,
        couchRequest = {
            db: mesh.config.appdb,
            action: modulePath + '.js'
        };

    if (loadedModules[modulePath]) {
        callback(loadedModules[modulePath]);
    }
    else {
        mesh.couch.get(couchRequest, function(error, res) {
            if (! error) {
                try {
                    // create the new module
                    var module = new Module('./' + app + '/' + moduleName);
                    module.filename =  path.resolve('lib/apps' + couchRequest.action);
                    
                    // compile it
                    module._compile(res, path.resolve('lib/apps' + couchRequest.action));

                    // cache it
                    loadedModules[modulePath] = module.exports;

                    // and return it
                    callback(module.exports);
                }
                catch (e) {
                    mesh.log('error importing app module "' + app + '/' + moduleName + '": ' + e.message);
                }
            } // if
        });
    } // if..else
} // loadModule

function loadRoute(mesh, routeData) {
    var handler = (routeData.value.handler || '').replace(reHandler, '$1'),
        handlerFn = (routeData.value.handler || '').replace(reHandler, '$2'),
        isCoreModule = routeData.value.coreHandler,
        module;
    
    if (isCoreModule) {
        module = require('../' + handler);
    }
    else {
        var pathData = (routeData.key || '').split(':');
        
        loadModule(mesh, routeData.id, handler, function(module) {
            mesh.emit('route', {
                method: pathData.length > 1 ? pathData[0] : 'GET',
                path: pathData.length > 1 ? pathData[1] : pathData[0],
                handler: mesh.wrap(module[handlerFn])
            });
        });
    } // if..else
} // loadRoute

exports.run = function(mesh) {
    mesh.couch.get({ db: mesh.config.appdb, action: routesView }, function(error, res) {
        for (var ii = 0; (! error) && ii < res.rows.length; ii++) {
            loadRoute(mesh, res.rows[ii]);
        } // for
    });
};
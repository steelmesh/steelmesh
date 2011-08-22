/**
# Routeloader
*/

var routesView = '_design/default/_view/routes',
    reHandler = /(.*)\.(.*)$/,
    path = require('path');
    
function loadModule(mesh, app, moduleName, callback) {
    var modulePath = '/' + app + '/lib/' + moduleName;
    
    try {
        // and return it
        callback(require(path.resolve('lib/apps' + modulePath)));
    }
    catch (e) {
        mesh.log('error importing app module "' + modulePath + '": ' + e.message);
    }
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
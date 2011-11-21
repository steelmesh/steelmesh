var config = require('config'),
    apploader = require('./apploaders/' + config.apploader),
    path = require('path'),
    changeling = require('changeling'),
    _ = require('underscore'),
    meshstub = {
        config: config
    },
    logger,
    log,
    out = require('out'),
    reTrailingSlash = /\/$/;
    
function _loadChangeListeners(app, listeners) {
    var modules = [];
    
    (listeners || []).forEach(function(listener) {
        var modulePath = path.resolve(__dirname, 'apps/' + app.id + '/lib/' + listener);
        log.info('loading change listener \'' + listener + '\' for app: ' + app.id);
        
        try {
            var listenerModule = require(modulePath);
            
            // if the listener module does not have a process function, then reject
            if (typeof listenerModule.process != 'function') {
                log.warn('listener module \'' + listener + '\' has no \'process\' function, skipped.');
            }
            else {
                modules.push(listenerModule);
            }
        }
        catch (e) {
            log.error('error loading listener module: ' + listener);
        }
    });
    
    return modules;
}
    
function _watchForChanges(app, dbUrls) {
    _.each(dbUrls, function(value, key) {
        var dbConfig = (app.couchdb || {})[key],
            changeListeners = _loadChangeListeners(app, (dbConfig || {}).changeListeners);
        
        changeling.monitor(value, { type: 'couchdb', getDoc: true }, function(err, notifier) {
            if (err) {
                log.error(err);
            }
            else {
                notifier.on('change', function(data) {
                    changeListeners.forEach(function(listener) {
                        listener.process(app, meshstub, data);
                    });
                });
            }
        });
    });
}
    
// initialise the logger type
process.env['STEELMESH_LOGGER_TYPE'] = 'monitor';

// include the logger
logger = require('./helpers/loggers/worker');
log = meshstub.log = logger.writer;

// monitor steelmesh for changes
changeling.monitor(config.couchurl.replace(reTrailingSlash, '') + '/' + config.meshdb, { type: 'couchdb' }, function(err, notifier) {
    if (! err) {
        notifier.on('change', function(item) {
            log.info('captured application update for app: ' + item.id);
            process.send({ action: 'restart' });
        });
    }
});

// load the apps (passing through a master override of false)
apploader.loadApps(meshstub, function(apps) {
    log.info('monitor started, monitoring ' + apps.length + ' apps');

    // iterate through each of the apps and wire up couch connections
    apps.forEach(function(app) {
        app.wireCouch(meshstub, function(dbUrls) {
            _watchForChanges(app, dbUrls);
        });
    });
}, false);
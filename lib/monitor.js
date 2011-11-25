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
    appPrefix = 'app::',
    reTrailingSlash = /\/$/,
    activeNotifiers = [];
    
function _loadChangeListeners(app, listeners) {
    var modules = [];
    
    (listeners || []).forEach(function(listener) {
        var modulePath = path.resolve(__dirname, 'apps/' + app.id + '/lib/' + listener + '.js');

        // remove the module path from the require cache
        require.cache[modulePath] = undefined;
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

function _monitorApps() {
    // close the active notifiers
    activeNotifiers.forEach(function(notifier) {
        notifier.close();
    });
    
    // reset the active notifiers list
    activeNotifiers = [];
    
    // load the apps (passing through a master override of false)
    apploader.loadApps(meshstub, function(err, apps) {
        if (! err) {
            log.info('monitor started, monitoring ' + apps.length + ' apps');

            // iterate through each of the apps and wire up couch connections
            apps.forEach(function(app) {
                app.wireCouch(meshstub, function(dbUrls) {
                    _watchForChanges(app, dbUrls);
                });
            });
        }
    }, false);
} // _monitorApps

function _monitorSteelmesh() {
    // monitor steelmesh for changes
    changeling.monitor(config.couchurl.replace(reTrailingSlash, '') + '/' + config.meshdb, { type: 'couchdb' }, function(err, notifier) {
        if (! err) {
            log.info('monitoring steelmesh db for changes');

            notifier.on('change', function(item) {
                // only handle application changes
                if (item && item.id && item.id.slice(0, appPrefix.length) === appPrefix) {
                    log.info('captured application update for app: ' + item.id);
                    
                    // flag a restart
                    process.send({ action: 'restart' });
                }
            });

            notifier.on('close', function() {
                log.warn('lost connection to steelmesh db, will attempt to reconnect');

                setTimeout(_monitorSteelmesh, 5000);
            });
        }
        else {
            meshstub.log.error(err);
            setTimeout(_monitorSteelmesh, 5000);
        }
    });    
} // _monitorSteelmesh
    
function _watchForChanges(app, dbUrls) {
    
    function attachMonitor(target, dbid, dbConfig) {
        var listeners = _loadChangeListeners(app, dbConfig.changeListeners);
        
        changeling.monitor(target, { type: 'couchdb', getDoc: true }, function(err, notifier) {
            if (err) {
                log.error('Unable to monitor db \'' + dbid + '\'', err);
            }
            else {
                notifier.on('change', function(data) {
                    listeners.forEach(function(listener) {
                        try {
                            listener.process(app, meshstub, data);
                        }
                        catch (e) {
                            log.error('error processing change listener for db \'' + dbid + '\'', e);
                        }
                    });
                });
                
                notifier.on('close', function(expected) {
                    if (! expected) {
                        log.warn('Connection to db \'' + dbid + '\' reset, attempting reconnect');
                        attachMonitor(target, dbid, dbConfig);
                    }
                });
                
                activeNotifiers.push(notifier);
            }
        });
    } // attachMonitor
    
    _.each(dbUrls, function(value, key) {
        attachMonitor(value, key,  (app.couchdb || {})[key] || {});
    });
}
    
// initialise the logger type
process.env['STEELMESH_LOGGER_TYPE'] = 'MON';

// monitor apps when we receive the server ready status
process.on('message', function(msg) {
    if (msg.status === 'ready') {
        log.info('server ready, monitoring couch databases for data changes');
        _monitorApps();
    }
});

// include the logger
logger = require('./helpers/loggers/worker');
log = meshstub.log = logger.writer;

// monitor steelmesh
_monitorSteelmesh();
var async = require('async'),
    config = require('config'),
    path = require('path'),
    cm = require('changemachine'),
    _ = require('underscore'),
    logger = require('./helpers/logger'),
    log = logger('monitor', {
        flushInterval: config.logFlushInterval
    }),
    meshstub = {
        config: config,
        log: log,
        serverPath: path.resolve(__dirname, '../')
    },
    out = require('out'),
    events = require('events'),
    util = require('util'),
    appPrefix = 'app::',
    reTrailingSlash = /\/$/,
    _jsonStore = new cm.JsonStore(path.resolve(__dirname, '../changestate.json')),
    _activeMachines = [],
    _activeJobs = {
        lastseq: {},
        stats: {},
        processing: {}
    },
    _apploader,
    _bridge,
    _checkers = {},
    _messenger,
    _healthPlugins = require('plug').create(config),
    _healthCheckTimer = 0,
    _reconnectDelay = (config.monitor.reconnectDelay || 30) * 1000,
    _msgReady = 'server ready, monitoring couch databases for data changes',
    _systemStatus = {
        available: false,
        systems: {}
    };
    
/* define the queue processor */

function _checkHealth() {
    
    var checkItems = _.map(_checkers, function(item, key) {
            return _.extend({ id: key }, item);
        }),
        serverAvailable = true;
        
    function checkItem(checker, itemCallback) {
        var timer = 0;
        
        if (checker.check) {
            timer = setTimeout(function() {
                log.debug('health check for system "' + checker.id + '" timed out');
                itemCallback();
            }, config.monitor.checkTimeout * 1000);
            
            try {
                log.debug('checking system "' + checker.id + '" availability');
                checker.check(function(results) {
                    var available = true;

                    // iterate through the results
                    (Array.isArray(results) ? results : [results]).forEach(function(checkData) {
                        if (typeof checkData == 'object') {
                            // add the id to the check data
                            checkData.id = checker.id;

                            // determine the overall system availability
                            available = available && (checkData.available || checkData.warning);
                            
                            // update the system status
                            _systemStatus.systems[checker.id] = checkData;
                        }
                        else {
                            log.warn('invalid check result returned from checker: ' + checker.id);
                        }
                        
                    });
                    
                    log.debug('system "' + checker.id + '" available: ' + available);
                    clearTimeout(timer);
                    
                    // update the overall system availability
                    // true if the system is available or the warning flag is set
                    serverAvailable = serverAvailable && available;
                    
                    // report the status
                    itemCallback();
                });
            }
            catch (e) {
                clearTimeout(timer);
                log.error('Error running health check for system: ' + checker.id, e);
                
                itemCallback();
            }
        }
    };
    
    async.forEach(checkItems, checkItem, function(err) {
        // update the overall system status
        _systemStatus.available = serverAvailable;
        
        // schedule the health check again
        _healthCheckTimer = setTimeout(_checkHealth, config.monitor.checkInterval * 1000);
    });
} // _checkHealth

function _handleDataRequest(request) {
    if (request && request.key) {
        var responseKey = 'monitor-provide-' + request.key + '-' + request.index;
        log.debug('received data request for: ' + request.key);

        switch (request.key) {
            case 'status': {
                _messenger.send(responseKey, _systemStatus);
                break;
            }
            
            case 'jobs': {
                _messenger.send(responseKey, _activeJobs);
            }
        }
    }
} // _handleDataRequest
    
function _monitorApps() {
    
    function loadApps() {
        // load the apps (passing through a master override of false)
        _apploader.loadApps(meshstub, function(err, apps) {
            if (! err) {
                log.info('monitoring ' + apps.length + ' apps');

                // iterate through each of the apps and wire up couch connections
                apps.forEach(function(app) {
                    app.wireCouch(config, function(dbUrls) {
                        _watchForChanges(app, dbUrls);
                    });
                });
            }
        }, false);
    } // loadApps
    
    // iterate through the active change machines and close them
    _activeMachines.forEach(function(machine) {
        machine.close();
    });
    
    // reset the engines array
    _activeMachines = [];
    
    if (! _apploader) {
        require('./helpers/apploader').init(config, log, function(apploader) {
            _apploader = apploader;
            loadApps();
        });
    }
    else {
        loadApps();
    }
} // _monitorApps

function _monitorSteelmesh() {
    var restartTimer = 0,
        targetUrl = config.couchurl.replace(reTrailingSlash, '') + '/' + config.meshdb,
        opts = {
            type: 'couchdb',
            storage: _jsonStore
        },
        machine = new cm.Machine(targetUrl, opts);
        
    log.debug('attempting to monitor steelmesh @ ' + targetUrl);
    machine.on('process', function(item) {
        // only handle application changes
        if (item && item.id && item.id.slice(0, appPrefix.length) === appPrefix) {
            log.info('captured application update for app: ' + item.id);
            
            clearTimeout(restartTimer);
            restartTimer = setTimeout(function() {
                _messenger.send('steelmesh-restart', { dashboard: true });
            }, 1000);
            
            // mark the item as done
            item.done();
        }
        // otherwise, skip the item
        else {
            item.skip();
        }
    });
} // _monitorSteelmesh
    
function _watchForChanges(app, dbUrls) {
    
    var allowCached = false;
    
    function attachMonitor(target, dbid, dbConfig) {
        log.debug('finding change listeners for db: ' + dbid);
        
        // TODO: load jobs from redis
        
        _apploader.loadPlugins(meshstub, app, dbConfig.changeListeners, allowCached, function(err, listeners) {
            // if we have some listeners, then listen for changes
            if (listeners && listeners.length > 0) {
                var machine = new cm.Machine(target, {
                        type: 'couchdb',
                        include_docs: true,
                        storage: _jsonStore
                    });

                // when we intercept process events, process the item
                log.debug('attempting monitoring: ' + target + ', for dbid: ' + dbid);
                machine.on('process', function(item) {
                    // reset the processors
                    var processors = [];
                    
                    // iterate through the listeners
                    listeners.forEach(function(listener) {
                        var processor = typeof listener == 'function' ? listener(app, meshstub, item) : null;

                        // if we have a processor, then queue it
                        if (processor) {
                            processors.push(processor);
                        }
                    });

                    // if we have listeners, then process them
                    if (processors.length) {
                        async.parallel(processors, function(err) {
                            item.done({ error: err });
                        });
                    }
                    else {
                        item.skip();
                    }
                });

                // add to the list of active machines
                _activeMachines.push(machine);
            }
        });
    } // attachMonitor
    
    _.each(dbUrls, function(value, key) {
        attachMonitor(value, key,  (app.couchdb || {})[key] || {});
    });
    
    // flag allow cached to true
    allowCached = true;
}
 
log.info('__STARTING MONITOR__');
log.debug('creating monitor messenger');
require('./helpers/messaging').create(function(messenger) {
    // save a reference to the messenger
    _messenger = messenger;
    
    // wire up the messenger
    messenger.on('app', function(appData) {
        if (appData.basePath) {
            log.info('app loaded, looking for health plugins in app path: ' + appData.basePath);
            _healthPlugins.find(path.resolve(appData.basePath, 'lib', 'plugins', 'health'));
        }
    });
    
    messenger.on('status', function(status) {
        if (status === 'initialized') {
            log.info(_msgReady);
            
            _monitorApps();
        }
    });
    
    // handle bridging data requests
    messenger.on('monitor-request', _handleDataRequest);
        
    // send the monitor ready message
    messenger.send('monitor-ready');
});

// initialise health plugins monitoring
_healthPlugins.on('connect', function(pluginName, pluginData) {
    log.info('found health plugin: '  + pluginName);
    _checkers[pluginName] = pluginData;
    
    // reschedule the health check timer
    clearTimeout(_healthCheckTimer);
    _healthCheckTimer = setTimeout(_checkHealth, 0);
});

_healthPlugins.on('drop', function(pluginName) {
    log.info('dropping health plugin: ' + pluginName);
    delete _checkers[pluginName];
});

_healthPlugins.find(path.resolve(__dirname, 'plugins', 'health'));

process.on('uncaughtException', function (err) {
    log.error('Unhandled exception: ' + (err ? err.message : ''), err);
    console.log(err.stack);
});

// monitor steelmesh
_monitorSteelmesh();
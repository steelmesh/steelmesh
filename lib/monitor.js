var async = require('async'),
    config = require('config'),
    debug = require('debug')('steelmesh-mon'),
    apploader = require('./apploaders/' + config.apploader),
    path = require('path'),
    changemate = require('changemate'),
    _ = require('underscore'),
    meshstub = {
        config: config
    },
    logger,
    log,
    out = require('out'),
    events = require('events'),
    util = require('util'),
    appPrefix = 'app::',
    reTrailingSlash = /\/$/,
    activeNotifiers = [],
    activeQueues = {},
    _checkers = {},
    _messenger,
    _healthPlugins = require('plug').create(config),
    _healthCheckTimer = 0,
    _msgReady = 'server ready, monitoring couch databases for data changes';
    
/* define the queue processor */

function QueueProcessor(target, min, max) {
    this.target = target;
    this.queue = [];
    this.min = min;
    this.max = max;
    this.active = 0;
} // QueueProcessor

util.inherits(QueueProcessor, events.EventEmitter);

QueueProcessor.prototype.add = function(handler, callback) {
    var processor = this;
    
    function processNext() {
        var shouldProcess = processor.queue.length > 0 && 
            (typeof processor.max == 'undefined' || processor.active < processor.max);
           
        // TODO: update steelmesh state data 
        // console.log(processor.active, processor.queue.length, shouldProcess);
        
        // console.log(processor.queue.length);
        if (processor.queue.length > 0 && shouldProcess) {
            var nextHandler = processor.queue.shift();
            
            // if the queue length has dropped below the min, then trigger the min event
            if (typeof processor.min != 'undefined' && processor.queue.length < processor.min) {
                processor.emit('min', processor.queue.length);
            }

            // console.log(nextHandler, new Date().getTime());
            
            // if it is a valid handler, then run it
            if (nextHandler && typeof nextHandler.handler == 'function') {
                try {
                    processor.active += 1;
                    nextHandler.handler(function() {
                        if (nextHandler.callback) {
                            nextHandler.callback();
                        }
                        
                        processor.active -= 1;
                        process.nextTick(processNext);
                    });
                }
                catch (e) {
                    log.error('error running change processor', e);
                }
            }
        }
        
        return processor.queue.length > 0;
    }
    
    // add the handler to the queue
    this.queue.push({
        handler: handler,
        callback: callback
    });
    
    // if the queue length has jump above the specified max, then emit the max event
    if (typeof this.max != 'undefined' && this.queue.length > this.max) {
        this.emit('max', this.queue.length);
    }
    
    processNext();
};

function _checkHealth() {
    
    var checkItems = _.map(_checkers, function(item, key) {
            return _.extend({ id: key }, item);
        }),
        serverAvailable = true;
        
    function checkItem(checker, itemCallback) {
        var timer = 0;
        
        if (checker.check) {
            timer = setTimeout(function() {
                debug('health check for system "' + checker.id + '" timed out');
                itemCallback();
            }, config.monitor.checkTimeout * 1000);
            
            try {
                debug('checking system "' + checker.id + '" availability');
                checker.check(function(results) {
                    var available = true;

                    // iterate through the results
                    (Array.isArray(results) ? results : [results]).forEach(function(checkData) {
                        // add the id to the check data
                        checkData.id = checker.id;

                        // determine the overall system availability
                        available = available && (checkData.available || checkData.warning);

                        // send the result health
                        if (_messenger) {
                            _messenger.send('health', checkData);
                        }
                    });
                    
                    debug('system "' + checker.id + '" available: ' + available);
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
        // send the node availability
        if (_messenger) {
            _messenger.send('serverup', serverAvailable);
        }
        
        // schedule the health check again
        _healthCheckTimer = setTimeout(_checkHealth, config.monitor.checkInterval * 1000);
    });
} // _checkHealth
    
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
            log.info('monitoring ' + apps.length + ' apps');

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
    var restartTimer = 0,
        targetUrl = config.couchurl.replace(reTrailingSlash, '') + '/' + config.meshdb,
        opts = {
            type: 'couchdb',
            autoPersist: true
        };
        
    debug('monitoring steelmesh @ ' + targetUrl);
    
    // monitor steelmesh for changes
    changemate(targetUrl, opts, function(err, notifier) {
        if (! err) {
            debug('monitoring steelmesh db for changes');

            notifier.on('change', function(item) {
                // only handle application changes
                if (item && item.id && item.id.slice(0, appPrefix.length) === appPrefix) {
                    log.info('captured application update for app: ' + item.id);
                    
                    clearTimeout(restartTimer);
                    restartTimer = setTimeout(function() {
                        _messenger.send('steelmesh-restart');
                    }, 1000);
                }
            });

            notifier.on('close', function() {
                debug('lost connection to steelmesh db, will attempt to reconnect');

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
    
    var allowCached = false;
    
    function attachMonitor(target, dbid, dbConfig) {
        apploader.loadPlugins(meshstub, app, dbConfig.changeListeners, allowCached, function(err, listeners) {
            var queue = activeQueues[target];
            
            // if the queue has not yet been created, then do it now
            if (! queue) {
                queue = activeQueues[target] = new QueueProcessor(target, 10, 25);
            }
        
            debug('monitoring: ' + target);
            changemate(target, { type: 'couchdb', getDoc: true }, function(err, notifier) {
                if (err) {
                    debug('error monitoring db: ' + dbid + ', target = ' + target);
                    log.error('Unable to monitor db \'' + dbid + '\' (' + target + ')', err);
                }
                else {
                    // when we have finished processing the queue, resume the notifier
                    queue.removeAllListeners('max');
                    queue.on('max', function() {
                        if (! notifier.paused) {
                            debug('pausing notifier');
                            notifier.pause();
                        
                            queue.once('min', function() {
                                debug('resuming notifier processing');
                                notifier.resume();
                            });
                        }
                    });
                
                    notifier.on('change', function(data) {
                        debug('captured change: ' + data.id + ', ' + listeners.length + ' listeners waiting');
                        
                        // we have data and that data has an id, then pass to the change listeners
                        if (data && data.id) {
                            listeners.forEach(function(listener) {
                                var processor = typeof listener == 'function' ? listener(app, meshstub, data) : null;

                                // if we have a processor, then queue it
                                if (processor) {
                                    // queue the processor, and when completed, update the last sequence
                                    queue.add(processor, function() {
                                        notifier.persist(data.seq);
                                    });
                                }
                                else {
                                    debug('!! listener failed to return processor');
                                }
                            });
                        }
                    });
                
                    notifier.on('close', function(expected) {
                        if (! expected) {
                            debug('Connection to db \'' + dbid + '\' reset, attempting reconnect');
                            attachMonitor(target, dbid, dbConfig);
                        }
                    });
                
                    activeNotifiers.push(notifier);
                }
            });
        });
    } // attachMonitor
    
    _.each(dbUrls, function(value, key) {
        attachMonitor(value, key,  (app.couchdb || {})[key] || {});
    });
    
    // flag allow cached to true
    allowCached = true;
}
    
// initialise the logger type
process.env['STEELMESH_LOGGER_TYPE'] = 'MON';

require('./helpers/messaging').create(function(messenger) {
    // save a reference to the messenger
    _messenger = messenger;
    
    // wire up the messenger
    messenger.on('app', function(appData) {
        if (appData.path) {
            debug('app loaded, looking for heath plugins in app path: ' + appData.path);
            _healthPlugins.find(path.resolve(appData.path, 'lib', 'plugins', 'health'));
        }
    });
    
    messenger.on('status', function(status) {
        if (status === 'initialized') {
            log.info(_msgReady);
            debug(_msgReady);
            
            _monitorApps();
        }
    });
    
    // send the monitor ready message
    messenger.send('monitor-ready');
});

// initialise health plugins monitoring
_healthPlugins.on('connect', function(pluginName, pluginData) {
    debug('found health plugin: '  + pluginName);
    _checkers[pluginName] = pluginData;
    
    // reschedule the health check timer
    clearTimeout(_healthCheckTimer);
    _healthCheckTimer = setTimeout(_checkHealth, 0);
});

_healthPlugins.on('drop', function(pluginName) {
    debug('dropping health plugin: ' + pluginName);
    delete _checkers[pluginName];
});

_healthPlugins.find(path.resolve(__dirname, 'plugins', 'health'));

// include the logger
logger = require('./helpers/loggers/worker');
log = meshstub.log = logger.writer;

process.on('uncaughtException', function (err) {
    log.error('Unhandled exception: ' + (err ? err.message : ''), err);
    console.log(err.stack);
});

// monitor steelmesh
_monitorSteelmesh();
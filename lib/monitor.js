var config = require('config'),
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
    activeQueues = {};
    
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
            if (typeof listenerModule.getProcessor != 'function') {
                log.warn('listener module \'' + listener + '\' has no \'getProcessor\' function, skipped.');
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
        opts = {
            type: 'couchdb',
            autoPersist: true
        };
    
    // monitor steelmesh for changes
    changemate(config.couchurl.replace(reTrailingSlash, '') + '/' + config.meshdb, opts, function(err, notifier) {
        if (! err) {
            log.info('monitoring steelmesh db for changes');

            notifier.on('change', function(item) {
                // only handle application changes
                if (item && item.id && item.id.slice(0, appPrefix.length) === appPrefix) {
                    log.info('captured application update for app: ' + item.id);
                    
                    clearTimeout(restartTimer);
                    restartTimer = setTimeout(function() {
                        // flag a restart
                        process.send({ action: 'restart' });
                    }, 1000);
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
        var listeners = _loadChangeListeners(app, dbConfig.changeListeners),
            queue = activeQueues[target];
            
        // if the queue has not yet been created, then do it now
        if (! queue) {
            queue = activeQueues[target] = new QueueProcessor(target, 10, 25);
        }
        
        changemate(target, { type: 'couchdb', getDoc: true }, function(err, notifier) {
            if (err) {
                log.error('Unable to monitor db \'' + dbid + '\' (' + target + ')', err);
            }
            else {
                // when we have finished processing the queue, resume the notifier
                queue.removeAllListeners('max');
                queue.on('max', function() {
                    if (! notifier.paused) {
                        notifier.pause();
                        
                        queue.once('min', function() {
                            console.log('resuming');
                            notifier.resume();
                        });
                    }
                });
                
                notifier.on('change', function(data) {
                    // we have data and that data has an id, then pass to the change listeners
                    if (data && data.id) {
                        listeners.forEach(function(listener) {
                            var processor = listener.getProcessor(app, meshstub, data);

                            // if we have a processor, then queue it
                            if (processor) {
                                // queue the processor, and when completed, update the last sequence
                                queue.add(processor, function() {
                                    notifier.persist(data.seq);
                                });
                            } 
                        });
                    }
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
    // if the message is a ready status update then monitor apps
    if (msg.status === 'initialized') {
        log.info('server ready, monitoring couch databases for data changes');
        _monitorApps();
    }
    // otherwise, if 
});

// include the logger
logger = require('./helpers/loggers/worker');
log = meshstub.log = logger.writer;

process.on('uncaughtException', function (err) {
    log.error('Unhandled exception: ' + (err ? err.message : ''), err);
    console.log(err.stack);
});

// monitor steelmesh
_monitorSteelmesh();
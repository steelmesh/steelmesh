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
    events = require('events'),
    util = require('util'),
    appPrefix = 'app::',
    reTrailingSlash = /\/$/,
    activeNotifiers = [],
    activeQueues = {};
    
/* define the queue processor */

function QueueProcessor() {
    this.queue = [];
} // QueueProcessor

util.inherits(QueueProcessor, events.EventEmitter);

QueueProcessor.prototype.add = function(handler, callback) {
    var processor = this;
    
    function processNext() {
        // console.log(processor.queue.length);
        if (processor.queue.length > 0) {
            var nextHandler = processor.queue.shift();

            // console.log(nextHandler, new Date().getTime());
            
            // if it is a valid handler, then run it
            if (nextHandler && typeof nextHandler.handler == 'function') {
                try {
                    nextHandler.handler(function() {
                        if (nextHandler.callback) {
                            nextHandler.callback();
                        }

                        process.nextTick(processNext);
                    });
                }
                catch (e) {
                    log.error('error running change processor', e);
                    process.nextTick(processNext);
                }
            }
            // otherwise, just process next
            else {
                process.nextTick(processNext);
            }
        }
        else {
            processor.inProgress = false;
            processor.emit('end');
        }
        
        return processor.queue.length > 0;
    }
    
    // add the handler to the queue
    this.queue.push({
        handler: handler,
        callback: callback
    });
    
    // if the process is not in progress, then process next
    if (! this.inProgress) {
        this.inProgress = true;
        processNext();
    }
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
    var restartTimer = 0;
    
    // monitor steelmesh for changes
    changeling.monitor(config.couchurl.replace(reTrailingSlash, '') + '/' + config.meshdb, { type: 'couchdb' }, function(err, notifier) {
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
            queue = activeQueues[target] = new QueueProcessor();
        }
        
        changeling.monitor(target, { type: 'couchdb', getDoc: true }, function(err, notifier) {
            if (err) {
                log.error('Unable to monitor db \'' + dbid + '\' (' + target + ')', err);
            }
            else {
                // when we have finished processing the queue, resume the notifier
                queue.on('end', function() {
                    notifier.resume();
                });
                
                notifier.on('change', function(data) {
                    // we have data and that data has an id, then pass to the change listeners
                    if (data && data.id) {
                        listeners.forEach(function(listener) {
                            var processor = listener.getProcessor(app, meshstub, data);

                            // if we have a processor, then queue it
                            if (processor) {
                                notifier.pause();

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
    if (msg.status === 'ready') {
        log.info('server ready, monitoring couch databases for data changes');
        _monitorApps();
    }
    // otherwise, if 
});

// include the logger
logger = require('./helpers/loggers/worker');
log = meshstub.log = logger.writer;

// monitor steelmesh
_monitorSteelmesh();
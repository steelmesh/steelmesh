var async = require('async'),
    config = require('config'),
    path = require('path'),
    changemate = require('changemate'),
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
    neuron = require('neuron'),
    manager = new neuron.JobManager({ concurrency: 50 }),
    out = require('out'),
    events = require('events'),
    util = require('util'),
    appPrefix = 'app::',
    reTrailingSlash = /\/$/,
    activeNotifiers = [],
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
    
    // close the active notifiers
    activeNotifiers.forEach(function(notifier) {
        notifier.close();
    });
    
    // reset the active notifiers list
    activeNotifiers = [];
    
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
            autoPersist: true
        };
        
    log.debug('attempting to monitor steelmesh @ ' + targetUrl);
    
    // monitor steelmesh for changes
    changemate(targetUrl, opts, function(err, notifier) {
        if (! err) {
            log.debug('monitoring steelmesh db (' + targetUrl + ') for changes');

            notifier.on('change', function(item) {
                // only handle application changes
                if (item && item.id && item.id.slice(0, appPrefix.length) === appPrefix) {
                    log.info('captured application update for app: ' + item.id);
                    
                    clearTimeout(restartTimer);
                    restartTimer = setTimeout(function() {
                        _messenger.send('steelmesh-restart', { dashboard: true });
                    }, 1000);
                }
            });

            notifier.on('close', function() {
                log.info('lost connection to steelmesh db, will attempt to reconnect in ' + _reconnectDelay + 'ms');
                setTimeout(_monitorSteelmesh, _reconnectDelay);
            });
        }
        else {
            log.error('Unable to connect to steelmesh db (' + targetUrl + '), attempting reconnect in ' + _reconnectDelay + 'ms', err);
            setTimeout(_monitorSteelmesh, _reconnectDelay);
        }
    });    
} // _monitorSteelmesh
    
function _watchForChanges(app, dbUrls) {
    
    var allowCached = false;
    
    function attachMonitor(target, dbid, dbConfig) {
        log.debug('finding change listeners for db: ' + dbid);
        
        // TODO: load jobs from redis
        
        _apploader.loadPlugins(meshstub, app, dbConfig.changeListeners, allowCached, function(err, listeners) {
            log.debug('attempting monitoring: ' + target + ', for dbid: ' + dbid);
            changemate(target, { type: 'couchdb', getDoc: true }, function(err, notifier) {
                if (err) {
                    log.error('Unable to monitor db \'' + dbid + '\' (' + target + '), attempting reconnect in ' + _reconnectDelay + 'ms', err);
                    
                    // attempt reattach
                    setTimeout(function() {
                        attachMonitor(target, dbid, dbConfig);
                    }, _reconnectDelay);
                }
                else {
                    log.debug('monitor connected: ' + target + ', for dbid: ' + dbid);
                    var queueName = dbid + '-updates';
                    
                    // remove the job queue if it exists
                    if (! manager.jobs[queueName]) {
                        var processing = _activeJobs.processing[dbid] = {},
                            stats = _activeJobs.stats[dbid] = {
                                processing: 0,
                                queued: 0
                            };
                        
                        manager.addJob(queueName, {
                            work: function(itemId, seqNo, processors) {
                                var worker = this;
                                
                                // update the last sequence number for this db
                                _activeJobs.lastseq[dbid] = seqNo;
                                stats.queued = this.job.queue.length;
                                stats.processing++;
                                
                                processing[itemId] = {
                                    seq: seqNo,
                                    started: new Date().getTime()
                                };
                                
                                log.debug('running ' + processors.length + ' processors for item: ' + itemId);
                                async.parallel(processors, function(err) {
                                    stats.processing--;
                                    delete processing[itemId];
                                    
                                    if (err) {
                                        log.warn('encountered error while processing item (' + itemId + '): ', err);
                                    }
                                    else {
                                        log.debug('finished processing item: ' + itemId);
                                    }
                                
                                    worker.finished = true;
                                });
                            }
                        });
                    }
                    
                    // when a job starts in the queue, check the queue length
                    manager.jobs[queueName].on('start', function(jobQueue) {
                        // if we have a queue 50% of the concurrency load, pause the notifier
                        if (jobQueue.queue.length >= (jobQueue.concurrency / 2) && (! notifier.paused)) {
                            log.info(dbid + ' notifier paused, queue length = ' + jobQueue.queue.length);
                            notifier.pause();

                            // once the queue is empty, resume the notifier
                            jobQueue.once('empty', function() {
                                log.info(dbid + ' notifier resumed');
                                notifier.resume();
                            });
                        }
                    });
                
                    notifier.on('change', function(data) {
                        log.debug('captured change: ' + data.id + ', ' + listeners.length + ' listeners waiting');
                        
                        // we have data and that data has an id, then pass to the change listeners
                        if (data && data.id) {
                            var processors = [], workerId, worker;
                            
                            // add the dburl to the data
                            data.dburl = target;
                            data.dbid = dbid;
                            
                            try {
                                // iterate through the listeners
                                listeners.forEach(function(listener) {
                                    var processor = typeof listener == 'function' ? listener(app, meshstub, data) : null;
                                    
                                    // if we have a processor, then queue it
                                    if (processor) {
                                        processors.push(processor);
                                    }
                                });
                                
                                // if no processors were found, then log a message, and then persist the data sequence
                                if (processors.length) {
                                    log.debug('queued ' + processors.length + ' processors for the ' + queueName + ' update queue');
                                    workerId = manager.enqueue(queueName, data.id, data.seq, processors);
                                    worker = manager.getWorker(queueName, workerId);
                                    
                                    if (worker) {
                                        worker.on('finish', function() {
                                            notifier.persist(data.seq);
                                        });
                                    }
                                }
                                else {
                                    log.info('no processors found for doc: ' + data.id);
                                    notifier.persist(data.seq);
                                }
                            }
                            catch (e) {
                                log.error('Error occurred while retrieving processors', e);
                            }
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
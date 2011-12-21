var path = require('path'),
    fs = require('fs'),
    config = require('config'),
    cluster = require('cluster'),
    cp = require('child_process'),
    out = require('out'),
    events = require('events'),
    express = require('express'),
    util = require('util'),
    async = require('async'),
    serverInfo = require('./helpers/serverinfo'),
    logger = require('./helpers/logger'),
    plug = require('plug'),
    log = logger(cluster.isMaster ? 'server' : 'workers', {
        flushEvery: config.logFlushInterval
    }),
    url = require('url'),
    _ = require('underscore'),
    reHost = /^(.*?)(\..*$|$)/,
    reLeadingSlash = /^\//,
    // determine the number of workers based on the config
    _workerCount = config.server.workers === 'auto' ? 
        require('os').cpus().length : 
        parseInt(config.server.workers, 10),
    _meshServer;
    
/* internal functions */

function _fork(target, messenger, callback) {
    var forkedProcess = cp.fork(path.resolve(__dirname, target + '.js'), null, {
        env: _.clone(process.env)
    });
    
    // capture the dash-ready event
    messenger.once(target + '-ready', callback);
    
    // return the newly forked process
    return forkedProcess;
} // _fork

function _handleTerminate() {
    process.exit();
}

/**
 * The _masterOnly function is used to return either the actual function if we are using the 
 * cluster.isMaster process, otherwise a placeholder function is returned that attempts to 
 * emulate the behaviour of the real function.  That is, it looks for a callback as the last 
 * parameter and if it exists then simply calls that.
 */
function _masterOnly(targetFunction) {
    return cluster.isMaster ? targetFunction : function() {
        var callback = arguments[arguments.length - 1];
        if (typeof callback == 'function') {
            callback.call();
        }
    };
};

function _processAction(data) {
    if (_meshServer.log) {
        _meshServer.log.info('Captured action: ' + data.action);
    }
    
    try {
        require('./helpers/actions/' + data.action).call(null, _meshServer, data);
    }
    catch (e) {
        if (_meshServer.log) {
            _meshServer.log.error('Could not load message handler for action: ' + data.action, e);
        }
    }
} // _processMessage

function _restart(opts) {
    function delayKill(timeout) {
        var clones = [].concat(_meshServer.workers);

        return function() {
            var targetPids = _.pluck(clones, 'pid');
            
            // shutdown old workers
            log.info('sending shutdown signal to pids: ' + targetPids.join(','));
            _meshServer.messenger.send('action', { 
                action: 'shutdown',
                targets: targetPids
            });

            setTimeout(function() {
                // kill the old workers
                clones.forEach(function(worker) {
                    worker.kill();
                });
            }, timeout);
        };
    } // _delayKill

    function runRestart() {
        // restart steelmesh
        _meshServer.restart(opts, delayKill(5000));
    } // _restart

    if (_meshServer.initializing) {
        _meshServer.removeListener('init', runRestart);
        _meshServer.once('init', runRestart);
    }
    else {
        runRestart();
    }
} // _restart

function SteelmeshServer() {
    // initialise the number of active workers
    // active workers have messaged the master and let them know they are up and running
    this.activeWorkers = 0;
    
    this.apps = [];
    this.masterProcess = true;
    this.mode = null;
    this.jobs = [];
    this.couch = null;
    this.settings = null;
    this.inSync = false;
    this.workers = [];
    this.config = config;
    this._status = '';
    this.serverPath = path.resolve(__dirname, '../');
    this.up = false;
    
    // initialise the master hostname
    this.masterHost = undefined;
} // Steelmesh constructor

util.inherits(SteelmeshServer, events.EventEmitter);

SteelmeshServer.prototype.cleanup = function() {
    log.info('steelmesh shutdown');
    
    // if we have a monitor, then kill it
    if (this.monitor) {
        this.monitor.kill();
    } // if
    
    // if we have a dashboard, then kill it
    if (this.dashboard) {
        this.dashboard.kill();
    }
    
    // kill each of the workers
    this.workers.forEach(function(worker) {
        worker.kill();
    });

    // update the status to shutdown
    _meshServer.status('shutdown');
}; // cleanup

SteelmeshServer.prototype.createServer = function(apps, callback) {
    // create the server
    var mesh = this,
        server = this.server = express.createServer(),
        logPath = process.env['STEELMESH_REQUESTLOG'],
        format = process.env['STEELMESH_REQUESTLOG_FORMAT'] || 'default',
        plugger = plug.create(server, this),
        stats,
        globalAddins = {};
        
    function finalizeServer() {
        // initialise the global addins
        for (var key in globalAddins) {
            globalAddins[key](_meshServer, server);
        } // for

        // specify the router location
        server.use(express.favicon(path.resolve(__dirname, '../assets/dashboard/public/favicon.ico')));
        server.use(server.router);
        
        // include common dashboard and worker process handlers
        plugger.find(path.resolve(__dirname, 'helpers/controllers'));
        
        // attach the fallback handler
        if (mesh.apploader.createResourceLoader) {
            mesh.log.info('assigning fallback resource loader from the apploader');
            server.use(mesh.apploader.createResourceLoader(_meshServer));
        } // if
        
        if (callback) {
            callback(server);
        }
    } // finalizeServer
    
    server.configure(function() {
        express.favicon();
        
        // handle errors
        server.error(function(err, req, res, next) {
            mesh.log.error('Error processing: ' + req.url, err);

            // TODO: pretty error display
            if (mesh.config.server.stacktrace) {
                res.send(err.stack, { 'Content-type': 'text/plain' });
            }
            else {
                next();
            }
        });

        // enable jsonp support
        server.enable('jsonp callback');
    });
    
    async.forEach(apps, function(app, itemCallback) {
        var mountpoint = (app.mountpoint || app.id).replace(reLeadingSlash, '');
        
        app.mount(_meshServer, function(instance) {
            mesh.log.info('mounting application \'' + app.id + '\' @ /' + mountpoint);
            server.use('/' + mountpoint, instance);
            
            // capture any global addins required by the app
            _.extend(globalAddins, app.globalAddins);
            
            // trigger the callback
            itemCallback();
        });
    }, finalizeServer);
}; // createServer

SteelmeshServer.prototype.discover = _masterOnly(function(callback) {
    var discoveryCfg = this.config.discovery || {},
        discovererType = discoveryCfg.type || 'none',
        discoverer,
        mesh = this;
        
    this.log.info('Attempting mesh discovery using the \'' + discovererType + '\' discoverer');
    
    // load the discoverer
    try {
        discoverer = require('./helpers/discovery/' + discovererType);
    }
    catch (e) {
        this.log.error('Error loading discoverer type \'' + discovererType + '\'', e);
        callback(e);
        return;
    }
    
    // attempt discovery
    discoverer.discover(this, this.config.discovery, function(err, isPrimary, primaryNodeConfig) {
        if (! err) {
            // update the network information
            if (isPrimary) {
                mesh.log.info('Current steelmesh instance detected as primary node');
            }
        }
        
        callback(err);
    });
});

SteelmeshServer.prototype.loadApps = function(callback) {
    var config = this.config,
        mesh = this;
        
    this.status('loading apps');
    this.log.info('loading apps using the ' +  this.config.apploader + ' apploader');
    
    this.apploader.loadApps(this, function(err, apps) {
        if (! err) {
            mesh.apps = apps || [];
            
            mesh.log.info('loaded ' + mesh.apps.length + ' apps');
            
            // master initialization
            if (cluster.isMaster) {
                mesh.log.info('Steelmesh master process initialized, forking ' + _workerCount + ' workers');
                
                // write the pid file
                fs.writeFile(path.resolve(__dirname, '../steelmesh.pid'), process.pid, 'utf8');
                
                mesh.status('forking workers');
                for (var ii = _workerCount; ii--; ) {
                    var worker = cluster.fork();
                    
                    // TODO: fix request logging
                    log.debug('forked worker: ' + worker.pid);
                    mesh.workers.push(worker);
                }
                
                // if we have a callback, then fire it
                if (callback) {
                    callback();
                }
            }
            // otherwise this is a worker process, so we will create the server
            else {
                mesh.createServer(apps, function(server) {
                    // listen on port 6633
                    server.listen(config.server.port);
                    
                    // let the master process know the server is online
                    mesh.messenger.send('action', { action: 'worker-online', pid: process.pid });

                    // if we have a callback, then fire it
                    if (callback) {
                        callback();
                    }
                });
            }
        }
        else {
            log.warn('error loading apps: ' + err);
            callback(err);
        }
    });    
};

SteelmeshServer.prototype.status = _masterOnly(function(status) {
    log.info('updating status to ' + status);
    
    // update the status
    this._status = status;
    if (this.messenger) {
        this.messenger.send('status', status);
    }
});

SteelmeshServer.prototype.restart = function(opts, callback) {
    // only continue if the status is online
    if (this.initializing) {
        if (this.log) {
            this.log.info('ignoring restart request, currently initializing');
        }

        return;
    }
    
    out('!{bold}restarting steelmesh');

    this.initializing = true;
    log.info('__restarting steelmesh__ (cleaning up ' + this.workers.length + ' workers)');
    
    // reset the apploader
    if (this.apploader) {
        this.apploader.emit('reset');
    }

    // update the status to restarting
    this.status('restarting');
    
    // restart mesh
    this.start(opts, callback);
};

SteelmeshServer.prototype.start = function(opts, callback) {
    
    var mesh = this,
        server = this.server;

    // check that we haven't only be passed a callback
    if (typeof opts == 'function') {
        callback = opts;
        opts = {};
    }
        
    // ensure we have options
    opts = opts || {};
        
    function realStart() {
        async.series([
            function(itemCallback) {
                mesh.loadApps(itemCallback);
            },
            
            function(itemCallback) {
                mesh.discover(itemCallback);
            }
        ], function(err) {
            if (err) {
                mesh.terminate(err);
            }
            else {
                // communicate the ready status
                mesh.status('initialized');
                
                // fire the callback once we have confirmed a new worker online
                if (callback) {
                    log.debug('watching for new worker creation');
                    mesh.once('new-worker', function(data) {
                        log.debug('first new worker online: ' + data.pid);
                        callback();
                    });
                }
            }
        });
    }
    
    // reset the workers array
    this.workers = [];
    this.activeWorkers = 0;
    this.initializing = true;
    
    log.info('__process start__');
    
    // start the dashboard
    mesh.subprocessStart('dashboard', opts, function() {
        mesh.subprocessStart('monitor', opts, function() {
            // if we don't yet, have the apploader, then create it
            // and when ready, load the applications
            if (! mesh.apploader) {
                mesh.log.info('Initializing apploader: ' + config.apploader);
                require('./helpers/apploader').init(config, log, function(apploader) {
                    mesh.apploader = apploader;
                    realStart();
                });
            }
            // otherwise, we are right to load the applications now
            else {
                realStart();
            }
        });
    });
}; // init

SteelmeshServer.prototype.subprocessStart = _masterOnly(function(name, restartOpts, callback) {
    var mesh = this;
    
    // if we should restart the subprocess and it exists, then kill it
    if (restartOpts[name] && this.hasOwnProperty(name)) {
        log.info('terminating ' + name + ' subprocess (pid = ' + this[name].pid + ')');
        this[name].kill();
        
        delete this[name];
    }

    // if the subprocess does not exist, then create it
    if (! this[name]) {
        log.info('starting ' + name + ' process');
        this[name] = _fork(name, this.messenger, function() {
            out('!{yellow}{0} started', name);
            log.info('steelmesh ' + name + ' process running');
            
            if (callback) {
                callback(mesh[name]);
            }
        });
    }
    else if (callback) {
        callback(this[name]);
    }
}); // subprocessStart

SteelmeshServer.prototype.terminate = function(errorMessage) {
    if (errorMessage) {
        out('!{bold}STEELMESH QUIT:!{} ' + errorMessage);
        this.log.error(errorMessage);
    }
    
    this.log.info('shutting down steelmesh');
    setTimeout(function() {
        process.exit(1);
    }, 50);
};

/* Mesh interface implementation */

// on worker death, log it
cluster.on('death', function(worker) {
    log.info('worker process #' + worker.pid + ' has ended');
});

module.exports = function() {
    _meshServer = new SteelmeshServer();
    
    // assign the log to the logger writer
    _meshServer.log = log;
    
    // handle mesh interrupt
    process.on('SIGINT', _handleTerminate);
    process.on('SIGTERM', _handleTerminate);
    
    if (cluster.isMaster) {
        // handle the mesh shutdown
        process.on('exit', function() {
            _meshServer.cleanup();
        });
    }

    // detect the mode we are running in (i.e. slave, master, hive, etc)
    process.on('uncaughtException', function (err) {
        log.error('Unhandled exception: ' + (err ? err.message : ''), err);
        console.log(err.stack);
    });
    
    log.debug('initializing server messenger, for process: ' + process.pid + ', is master = ' + cluster.isMaster);
    require('./helpers/messaging').create(function(messenger) {
        // attach the messenger to the server
        _meshServer.messenger = messenger;
        
        // create the monitor bridget
        _meshServer.monitorBridge = messenger.bridge('monitor');
        
        // handle restarts
        messenger.on('steelmesh-restart', _restart);
        messenger.on('action', _processAction);
        
        // start the server
        _meshServer.start();
    });
};
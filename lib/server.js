var debug = require('debug')('steelmesh'),
    path = require('path'),
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
    url = require('url'),
    _ = require('underscore'),
    reHost = /^(.*?)(\..*$|$)/,
    reLeadingSlash = /^\//,
    // determine the number of workers based on the config
    _workerCount = config.server.workers === 'auto' ? 
        require('os').cpus().length : 
        parseInt(config.server.workers),
    _logger = require('./helpers/loggers/' + (cluster.isMaster ? 'master' : 'worker')),
    _meshServer,
    _serverup = false;
    
/* internal functions */

function _fork(target, messenger, callback) {
    var forkedProcess = cp.fork(path.resolve(__dirname, target + '.js'), null, {
        env: _.clone(process.env)
    });
    
    // attach the log worker
    _logger.attachWorker(forkedProcess);
    
    // capture the dash-ready event
    messenger.on(target + '-ready', callback);
}

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

function dummyStackFn(mesh, callback) {
    if (callback) {
        callback();
    } // if
} // dummyStackFn

function loadSettingsFile(mesh, callback) {
    fs.readFile('settings.json', 'utf8', function(err, data) {
        if (err) {
            mesh.settings = {};
        }
        else {
            mesh.settings = JSON.parse(data);
        } // if..else
        
        if (callback) {
            callback();
        } // if..else
    });
} // loadSettingsFile

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
    
    // initialise the master hostname
    this.masterHost = undefined;
} // Steelmesh constructor

util.inherits(SteelmeshServer, events.EventEmitter);

SteelmeshServer.prototype.cleanup = function() {
    this.log.info('steelmesh shutdown');
    
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
}; // cleanup

SteelmeshServer.prototype.createServer = function(apps, callback) {
    // create the server
    var mesh = this,
        server = this.server = express.createServer(),
        logPath = process.env['STEELMESH_REQUESTLOG'],
        format = process.env['STEELMESH_REQUESTLOG_FORMAT'] || 'default',
        stats,
        globalAddins = {};
        
    function finalizeServer() {
        // initialise the global addins
        for (var key in globalAddins) {
            globalAddins[key](_meshServer, server);
        } // for

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

    /*
    // TODO: customize log format
    // TODO: making logging configurable on and off...
    if (logPath) {
        try {
            stats = fs.statSync(logPath);
        }
        catch (e) {
        }

        server.use(express.logger({
            format: format,
            buffer: mesh.config.logFlushInterval,
            stream: fs.createWriteStream(logPath, {
                flags: stats ? 'r+' : 'w',
                encoding: 'utf8',
                start: stats ? stats.size : 0
            })
        }));
    }
    */
    
    async.forEach(apps, function(app, itemCallback) {
        var mountpoint = (app.mountpoint || app.id).replace(reLeadingSlash, '');
        
        app.mount(_meshServer, function(instance) {
            mesh.log.info('mounting application \'' + app.id + '\' @ /' + mountpoint);
            server.use(function(req, res, next) {
                if (req.url === '/up') {
                    res.json({ server: _serverup ? 'up' : 'down' });
                }
                else {
                    next();
                }
            });
            
            server.use('/' + mountpoint, instance);
            
            // capture any global addins required by the app
            _.extend(globalAddins, app.globalAddins);
            
            // trigger the callback
            itemCallback();
        });
    }, finalizeServer);
}; // createServer

SteelmeshServer.prototype.discover = function(callback) {
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
};

SteelmeshServer.prototype.loadApps = function(callback) {
    var config = this.config,
        mesh = this;
        
    this.status('loading apps');
    this.log.info('loading apps using the ' +  this.config.apploader + ' apploader');
    
    this.apploader.loadApps(this, function(err, apps) {
        if (! err) {
            mesh.apps = apps || [];
            
            // master initialization
            if (cluster.isMaster) {
                mesh.log.info('Steelmesh master process initialized, forking ' + _workerCount + ' workers');
                
                // write the pid file
                fs.writeFile(path.resolve(__dirname, '../steelmesh.pid'), process.pid, 'utf8');
                
                for (var ii = _workerCount; ii--; ) {
                    var worker = cluster.fork();

                    // TODO: fix request logging
                    /*
                    _sendMessage(mesh, worker, {
                        action: 'update-env',
                        key: 'STEELMESH_REQUESTLOG',
                        value: path.resolve(__dirname, '../logs/worker-' + ii + '-requests.log')
                    })e
                    */;

                    // attach the worker to the logger
                    mesh.logger.attachWorker(worker);

                    // initialise worker message handling
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
            callback(err);
        }
    });    
};

SteelmeshServer.prototype.status = function(status) {
    var mesh = this;
    
    if (! cluster.isMaster) {
        return;
    }
    
    // update the status
    this._status = status;
    if (this.messenger) {
        this.messenger.send('status', status);
    }
};

SteelmeshServer.prototype.restart = function(opts, callback) {
    // only continue if the status is online
    if (this._status !== 'online') {
        if (this.log) {
            this.log.info('ignoring restart request, current status = ' + this._status);
        }

        return;
    }
    
    out('!{bold}restarting steelmesh');

    this.initializing = true;
    this.log.info('__restarting steelmesh__ (cleaning up ' + this.workers.length + ' workers)');
    
    // reset the apploader
    if (this.apploader) {
        this.apploader.emit('reset');
    }
    
    // shutdown old workers
    this.messenger.send('action', { 
        action: 'shutdown',
        targets: _.pluck(this.workers, 'pid')
    });
    
    // reset the workers array
    this.workers = [];
    this.status('restarting');
    
    // restart mesh
    this.start(callback);
};

SteelmeshServer.prototype.start = function(callback) {
    
    var mesh = this,
        server = this.server;
        
    function realStart() {
        async.series([
            function(itemCallback) {
                mesh.loadApps(itemCallback);
            },
            
            function(itemCallback) {
                cluster.isMaster ? mesh.discover(itemCallback) : itemCallback();
            }
        ], function(err) {
            if (err) {
                mesh.terminate(err);
            }
            else {
                // communicate the ready status
                mesh.status('initialized');
            }
        });
    }
    
    function handleTerminate() {
        process.exit();
    } // handleTerminate
    
    // if the log hasn't been initialised then do that now
    if (! this.log) {
        this.logger = _logger;
        if (cluster.isMaster) {
            this.logger.flushEvery(config.logFlushInterval);
        }
        
        // assign the log to the logger writer
        this.log = this.logger.writer;
        
        // handle mesh interrupt
        process.on('SIGINT', handleTerminate);
        process.on('SIGTERM', handleTerminate);
        
        if (cluster.isMaster) {
            // handle the mesh shutdown
            process.on('exit', function() {
                _meshServer.status('shutdown');
                SteelmeshServer.prototype.cleanup.call(_meshServer);
            });
        }

        // detect the mode we are running in (i.e. slave, master, hive, etc)
        process.on('uncaughtException', function (err) {
            mesh.log.error('Unhandled exception: ' + (err ? err.message : ''), err);

            console.log(err.stack);
        });
    }
    
    // if we don't yet, have the apploader, then create it
    // and when ready, load the applications
    if (! this.apploader) {
        this.log.info('Initializing apploader: ' + config.apploader);
        this.apploader = require('./apploaders/' + config.apploader);

        // when the apploader is ready, then load the apps
        this.apploader.init(this);
        this.apploader.on('ready', function() {
            realStart();
        });
    }
    // otherwise, we are right to load the applications now
    else {
        realStart();
    }
    
    // reset the workers array
    this.workers = [];
    this.activeWorkers = 0;
    this.initializing = true;
    
    this.log.info('__process start__');
}; // init

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
    if (_meshServer.log) {
        _meshServer.log.info('worker process #' + worker.pid + ' has ended');
    } // if
});

exports.start = function() {
    _meshServer = new SteelmeshServer();
    
    debug('initializing server messenger, for process: ' + process.pid + ', is master = ' + cluster.isMaster);
    require('./helpers/messaging').create(function(messenger) {
        // attach the messenger to the server
        _meshServer.messenger = messenger;
        
        // handle restarts
        messenger.on('steelmesh-restart', function() {
            require('./helpers/actions/restart')(_meshServer);
        });
        
        // handle actions
        messenger.on('action', _processAction);
        
        messenger.on('serverup', function(value) {
            _serverup = value;
        });
        
        // if this is the master process, then create the dashboard before proceeding
        if (cluster.isMaster) {
            debug('starting the dashboard process');
            _meshServer.dashboard = _fork('dashboard', messenger, function() {
                out('steelmesh dashboard ready at: !{underline}http://localhost:{0}', config.dashboard.port);

                _meshServer.monitor = _fork('monitor', messenger, function() {
                    out('steelmesh monitor process running');
                    _meshServer.start();
                });
            });
        }
        // otherwise, start the server
        else {
            _meshServer.start();
        }
    });
};
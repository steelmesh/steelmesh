var path = require('path'),
    fs = require('fs'),
    os = require('os'),
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
    reLeadingSlash = /^\//;
    
/* internal functions */

function _processAction(msg) {
    if (msg && msg.action) {
        if (_this.log) {
            _this.log.info('Captured action: ' + msg.action);
        }
        
        try {
            require('./helpers/actions/' + msg.action).call(null, _this, msg);
        }
        catch (e) {
            if (_this.log) {
                _this.log.error('Could not load message handler for action: ' + msg.action, e);
            }
        }
    }
} // _processMessage

function _sendMessage(mesh, processes, message) {
    // if the target process is not an array, then bundle into an array
    if (! Array.isArray(processes)) {
        processes = [processes];
    }
    
    processes.forEach(function(targetProc) {
        if (targetProc) {
            try {
                targetProc.send(message);
            }
            catch (e) {
                mesh.log.warn('Unable to send message to process: ' + targetProc.pid, e);
            }
        }
    });
}

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
            globalAddins[key](_this, server);
        } // for

        // attach the fallback handler
        if (mesh.apploader.createResourceLoader) {
            mesh.log.info('assigning fallback resource loader from the apploader');
            server.use(mesh.apploader.createResourceLoader(_this));
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
    
    async.forEach(apps, function(app, itemCallback) {
        var mountpoint = (app.mountpoint || app.id).replace(reLeadingSlash, '');
        
        app.mount(_this, function(instance) {
            mesh.log.info('mounting application \'' + app.id + '\' @ /' + mountpoint);
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
            // otherwise, let the monitor process know about the primary node configuration
            else if (mesh.monitor) {
                _sendMessage(mesh, mesh.monitor, { action: 'attach', target: primaryNodeConfig });
            }
            // otherwise, report an error
            else {
                mesh.log.error('Found a primary node, but could not notify monitor process');
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
            
            // communicate the loaded applications
            mesh.state('apps', _.map(apps, function(item) {
                return {
                    id: item.id,
                    mountpoint: item.mountpoint || item.id,
                    addins: item.addins
                };
            }));
            
            // master initialization
            if (cluster.isMaster) {
                mesh.log.info('Steelmesh master process initialized, forking ' + os.cpus().length + ' workers');

                // initialise master services
                mesh.initMonitor();
                
                // write the pid file
                fs.writeFile(path.resolve(__dirname, '../steelmesh.pid'), process.pid, 'utf8');
                
                for (var ii = os.cpus().length; ii--; ) {
                    var worker = cluster.fork();

                    _sendMessage(mesh, worker, {
                        action: 'update-env',
                        key: 'STEELMESH_REQUESTLOG',
                        value: path.resolve(__dirname, '../logs/worker-' + ii + '-requests.log')
                    });

                    // attach the worker to the logger
                    mesh.logger.attachWorker(worker);

                    // initialise worker message handling
                    worker.on('message', _processAction);
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
                    // listen on port 3000
                    server.listen(config.server.port);
                    
                    // let the master process know the server is online
                    _sendMessage(mesh, process, { action: 'worker-online', pid: process.pid });

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

SteelmeshServer.prototype.state = function(property, value) {
    if (this.redis) {
        var data = {};
        
        // update the data
        data[property] = typeof value == 'object' ? JSON.stringify(value) : value;
        this.redis.HMSET('steelmesh', data);
    }
};

SteelmeshServer.prototype.status = function(status) {
    var mesh = this;

    // send a message to the workers and the monitor and dashboard
    _sendMessage(
        this, 
        this.workers.concat(this.monitor, this.dashboard),
        { status: status }
    );
    
    this.state('status', status);
};

SteelmeshServer.prototype.restart = function(opts, callback) {
    this.initializing = true;
    this.log.info('__restarting steelmesh__ (cleaning up ' + this.workers.length + ' workers)');
    
    // kill each of the workers
    this.workers.forEach(function(worker) {
        worker.send({ action: 'shutdown' });
    });
    
    // reset the workers array
    this.workers = [];
    this.status('restarting');

    // if the options include restarting the monitor then kill the monitor process
    if (opts.restartMonitor && this.monitor) {
        this.log.info('Restarting monitor');
        this.monitor.kill();

        delete this.monitor;
    }

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
        this.logger = require('./helpers/loggers/' + (cluster.isMaster ? 'master' : 'worker'));
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
                _this.status('shutdown');
                SteelmeshServer.prototype.cleanup.call(_this);
            });
        }

        // detect the mode we are running in (i.e. slave, master, hive, etc)
        process.on('uncaughtException', function (err) {
            mesh.log.error('Unhandled exception: ' + (err ? err.message : ''), err);

            console.log(err.stack);
        });
    }
    
    // initialise the dashboard before loading apps (it's helpful to have it around)
    if (cluster.isMaster) {
        mesh.initRedis(config.redis);
        mesh.initDashboard();
    } // if
    
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

SteelmeshServer.prototype.initLog = function() {
    return require('./log')();
}; // initLog

SteelmeshServer.prototype.initDashboard = function() {
    // only create the monitor if it doesn't already exist
    // and we are the cluster master
    if (! this.dashboard) {
        // fork the application monitor
        this.dashboard = cp.fork(path.resolve(__dirname, 'dashboard.js'));
        this.logger.attachWorker(this.dashboard);

        // listen for messages
        this.dashboard.on('message', _processAction);
    }
}; // initMonitor

SteelmeshServer.prototype.initMonitor = function() {
    // only create the monitor if it doesn't already exist
    // and we are the cluster master
    if (! this.monitor) {
        // fork the application monitor
        this.monitor = cp.fork(path.resolve(__dirname, 'monitor.js'));
        this.logger.attachWorker(this.monitor);

        // listen for messages
        this.monitor.on('message', _processAction);
    }
}; // initMonitor

SteelmeshServer.prototype.initRedis = function(redisConfig) {
    var mesh = this,
        client = require('redis').createClient(redisConfig.port, redisConfig.host);
        
    client.on('ready', function() {
        mesh.redis = client;
        mesh.log.info('connection to redis established');
        
        mesh.emit('redis', client);
    });
    
    client.on('error', function(err) {
        mesh.log.error('redis error', err);
        
        // if mesh redis is not assigned, then tell the client to quit
        // as it would appear redis is not available
        if (! mesh.redis) {
            client.quit();
            
            // hacky, but set the closing flag so it stops raising errors!!
            client.closing = true;
        }
    });
}; // initRedis

SteelmeshServer.prototype.isSlave = function() {
    return this.mode === 'slave';
}; // isMaster

/* Mesh interface implementation */

var _this = module.exports = new SteelmeshServer();

// handle IPC
process.on('message', _processAction);

// on worker death, log it
cluster.on('death', function(worker) {
    if (_this.log) {
        _this.log.info('worker process #' + worker.pid + ' has ended');
    } // if
});

// when redis is available collect status
_this.on('redis', function() {
    serverInfo.collect(_this);
});
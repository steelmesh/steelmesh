var path = require('path'),
    fs = require('fs'),
    os = require('os'),
    cluster = require('cluster'),
    cp = require('child_process'),
    out = require('out'),
    events = require('events'),
    express = require('express'),
    util = require('util'),
    async = require('async'),
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
    /*
    this.config = {
        // define the apploader 
        apploader: 'couch',
        
        // define the couch database configuration
        couchurl: 'http://localhost:5984/',
        meshdb: 'steelmesh',
        syncInterval: 5000,

        // path the directory that will hold logs
        pathLogs: path.resolve('logs'),

        // some configuration defaults
        farmRegex: /^(\w+)(\-?.*)$/i,
        farmMaster: 'master'
    };
    */

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
    
    // initialise the master hostname
    this.masterHost = undefined;
} // Steelmesh constructor

util.inherits(SteelmeshServer, events.EventEmitter);

SteelmeshServer.prototype.cleanup = function() {
    this.log.info('steelmesh shutdown');
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
        if (mesh.apploader.loadResource) {
            mesh.log.info('assigning fallback resource loader from the apploader');
            server.use(function(req, res, next) {
                mesh.apploader.loadResource(_this, req, res, next);
            });
        } // if

        /*
        server.error(function(err, req, res, next) {
            mesh.log.error('Error processing: ' + req.url, err);
            next();
        });    
        */
        
        if (callback) {
            callback(server);
        }
    } // finalizeServer
    
    server.configure(function() {
        express.favicon();
        
        server.use(express.errorHandler({ dumpExceptions: true, showStack: true }));

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

SteelmeshServer.prototype.detectMode = function(callback) {
    var hostname = os.hostname(),
        isSlave = hostname.replace(this.config.farmRegex, '$1').toLowerCase() !== 
            this.config.farmMaster.toLowerCase();
        
    // if we are on the warchief box, then the master process is the warchief and 
    // the worker process is the highlander (there can be only one)
    this.mode = this.masterProcess ? (isSlave ? 'slave' : 'master') : 'worker';
    
    if (isSlave) {
        this.masterHost = 'master' + hostname.replace(this.config.farmRegex, '$2');
    } // if

    this.log.info('steelmesh initialized, mode = ' + this.mode);
    this.emit('updateMode', this.mode);
}; // detectMode

SteelmeshServer.prototype.restart = function(callback) {
    this.initializing = true;
    this.log.info('Restarting Steelmesh');

    // restart mesh
    this.start(callback);
};

SteelmeshServer.prototype.start = function(callback) {
    
    var mesh = this,
        server = this.server,
        config = this.config = require('config'),
        apploader = this.apploader = require('./apploaders/' + config.apploader),
        logger = require('./helpers/loggers/' + (cluster.isMaster ? 'master' : 'worker'));
        
    // initialise the log
    this.log = logger.writer;
    
    // reset the workers array
    this.workers = [];
    this.activeWorkers = 0;
    this.initializing = true;
    
    /*
    function handleTerminate() {
        process.exit();
    } // handleTerminate

    // handle mesh interrupt
    process.on('SIGINT', handleTerminate);
    process.on('SIGTERM', handleTerminate);
    
    // handle the mesh shutdown
    process.on('exit', function() {
        SteelmeshServer.prototype.cleanup.call(_this);
    });
    */
    
    // initialise logging
    if (cluster.isMaster) {
        this.log.info('Steelmesh Starting');
        this.log.info('------------------');
        logger.flushEvery(config.logFlushInterval);
    }

    this.log.info('## process start');
    
    // initialise the apploader
    this.log.info('loading apps using the ' +  config.apploader + ' apploader');
    apploader.loadApps(mesh, function(err, apps) {
        if (! err) {
            mesh.apps = apps || [];

            // initialise the monitor
            mesh.initMonitor(logger);

            // master initialization
            if (cluster.isMaster) {
                mesh.log.info('Steelmesh master process initialized, forking ' + os.cpus().length + ' workers');
                for (var ii = os.cpus().length; ii--; ) {
                    var worker = cluster.fork();

                    worker.send({
                        action: 'update-env',
                        key: 'STEELMESH_REQUESTLOG',
                        value: path.resolve(__dirname, '../logs/worker-' + ii + '-requests.log')
                    });

                    // attach the worker to the logger
                    logger.attachWorker(worker);

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
                    process.send({ action: 'worker-online', pid: process.pid });

                    // if we have a callback, then fire it
                    if (callback) {
                        callback();
                    }
                });
            }
        }
        else {
            mesh.terminate(err);
        }
    });
    
    // this.masterProcess = typeof this.cluster == 'undefined' || this.cluster.isMaster;
    
    // detect the mode we are running in (i.e. slave, master, hive, etc)
    // this.detectMode();
    /*
    process.on('uncaughtException', function (err) {
        mesh.log.error(err);
    });    
    */
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

SteelmeshServer.prototype.initMonitor = function(logger) {
    // only create the monitor if it doesn't already exist
    // and we are the cluster master
    if ((! this.monitor) && cluster.isMaster) {
        // fork the application monitor
        this.monitor = cp.fork(path.resolve(__dirname, 'monitor.js'));
        logger.attachWorker(this.monitor);

        // listen for messages
        this.monitor.on('message', _processAction);
    }
}; // initMonitor

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
        _this.log.info('worker ' + worker.pid + ' died');
    } // if
    
    this.log.info('worker {0} died', worker.pid);
});
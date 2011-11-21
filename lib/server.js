var path = require('path'),
    fs = require('fs'),
    os = require('os'),
    cluster = require('cluster'),
    out = cluster.isMaster ? require('out') : function() {},
    cp = require('child_process'),
    events = require('events'),
    express = require('express'),
    util = require('util'),
    async = require('async'),
    url = require('url'),
    _ = require('underscore'),
    reHost = /^(.*?)(\..*$|$)/,
    reLeadingSlash = /^\//,
    messageHandlers = {};
    
/* internal functions */

function _processAction(msg) {
    if (msg && msg.action) {
        if (_this.log) {
            _this.log.info('Captured action: ' + msg.action);
        }
        
        if (! messageHandlers[msg.action]) {
            try {
                messageHandlers[msg.action] = require('./helpers/actions/' + msg.action);
            }
            catch (e) {
                if (_this.log) {
                    _this.log.error('Could not load message handler for action: ' + msg.action);
                }
            }
        }
    
        if (messageHandlers[msg.action]) {
            messageHandlers[msg.action].call(null, _this, msg);
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

SteelmeshServer.prototype.createServer = function() {
    // create the server
    var server = this.server = express.createServer(),
        logPath = process.env['STEELMESH_REQUESTLOG'],
        format = process.env['STEELMESH_REQUESTLOG_FORMAT'] || 'default',
        stats,
        globalAddins = {};
    
    server.configure(function() {
        express.favicon();
        
        // enable jsonp support
        server.enable('jsonp callback');
    });
    
    this.apps.forEach(function(app) {
        var mountpoint = (app.mountpoint || app.id).replace(reLeadingSlash, '');
        
        app.mount(_this, function(instance) {
            server.use('/' + mountpoint, instance);
        });
        
        // capture any global addins required by the app
        _.extend(globalAddins, app.globalAddins);
    });
    
    // initialise the global addins
    for (var key in globalAddins) {
        globalAddins[key](_this, server);
    } // for

    // attach the fallback handler
    if (this.apploader.loadResource) {
        server.use(function(req, res, next) {
            _this.apploader.loadResource(_this, req, res, next);
        });
    } // if
    
    server.error(function(err, req, res, next) {
        mesh.reportError(err, req.url);
        next();
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
            buffer: false,
            stream: fs.createWriteStream(logPath, {
                flags: stats ? 'r+' : 'w',
                encoding: 'utf8',
                start: stats ? stats.size : 0
            })
        }));
    }
    
    return server;
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

SteelmeshServer.prototype.start = function(callback) {
    
    var mesh = this,
        server = this.server,
        config = this.config = require('config'),
        apploader = this.apploader = require('./apploaders/' + config.apploader),
        logger = require('./helpers/loggers/' + (cluster.isMaster ? 'master' : 'worker'));
        
    // initialise the log
    this.log = logger.writer;
    
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
    this.log.info('steelmesh starting');
    
    // initialise the apploader
    out('loading apps using the !{underline}{0}!{} apploader', config.apploader);
    apploader.loadApps(mesh, function(apps) {
        mesh.apps = apps || [];

        // master initialization
        if (cluster.isMaster) {
            out('Steelmesh master process initialized, forking {0} workers', os.cpus().length);
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

            // fork the application monitor
            mesh.monitor = cp.fork(path.resolve(__dirname, 'monitor.js'));
            logger.attachWorker(mesh.monitor);
            
            // listen for messages
            mesh.monitor.on('message', _processAction);
            
            // if we have a callback, then fire it
            if (callback) {
                callback();
            }
        }
        // otherwise this is a worker process, so we will create the server
        else {
            mesh.createServer().listen(3001);
            if (callback) {
                callback();
            }
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

SteelmeshServer.prototype.initLog = function() {
    return require('./log')();
}; // initLog

SteelmeshServer.prototype.isSlave = function() {
    return this.mode === 'slave';
}; // isMaster

/* Mesh interface implementation */

SteelmeshServer.prototype.reportError = function(exception, description) {
    console.error('EXCEPTION OCCURED: ' + (description || ''));
    console.error(exception);
    console.error(exception.stack);
};

var _this = module.exports = new SteelmeshServer();

// handle IPC
process.on('message', _processAction);

// on worker death, log it
cluster.on('death', function(worker) {
    if (_this.log) {
        _this.log.info('worker ' + worker.pid + ' died');
    } // if
    
    out('worker {0} died', worker.pid);
});
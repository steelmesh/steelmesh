var path = require('path'),
    fs = require('fs'),
    os = require('os'),
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

function _processMessage(command, data) {
    if (! messageHandlers[command]) {
        try {
            messageHandlers[command] = require('./messaging/' + command);
        }
        catch (e) {
            if (_this.log) {
                _this.log.warn('Could not load message handler for command: ' + command);
            }
        }
    }
    
    if (messageHandlers[command]) {
        messageHandlers[command].call(null, _this, data);
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
    this.config = {
        // define the apploader 
        apploader: 'couch',
        
        // define the couch database configuration
        couchurl: 'http://localhost:5984/',
        meshdb: 'steelmesh',
        syncInterval: 5000,

        // path the directory that will hold logs
        pathLogs: path.resolve('logs'),

        // path to the job files
        pathJobs: path.resolve('lib/jobs'),
        
        // some configuration defaults
        farmRegex: /^(\w+)(\-?.*)$/i,
        farmMaster: 'master',
        
        // whether or not write operations should be logged
        logWrites: true,
        
        // default pgsql connection string
        pgUrl: 'tcp://postgres:1234@localhost/meshdata',
        
        // TODO: remove these and place in the geo module
        urls: [
            'http://localhost:8080/geoserver/wfs'
        ]
    };

    this.apps = [];
    this.masterProcess = true;
    this.mode = null;
    this.jobs = [];
    this.couch = null;
    this.settings = null;
    this.inSync = false;
    
    // initialise the master hostname
    this.masterHost = undefined;
} // Steelmesh constructor

util.inherits(SteelmeshServer, events.EventEmitter);

SteelmeshServer.prototype.cleanup = function() {
    this.log.info('steelmesh shutdown');
}; // cleanup

SteelmeshServer.prototype.configure = function(initConfig) {
    function handleTerminate() {
        process.exit();
    } // handleTerminate

    // initialise the initialization config to defaults
    initConfig = initConfig || {};
    
    for (var key in initConfig) {
        this.config[key] = initConfig[key];
    } // for
    
    // handle mesh interrupt
    process.on('SIGINT', handleTerminate);
    process.on('SIGTERM', handleTerminate);
    
    // handle the mesh shutdown
    process.on('exit', function() {
        SteelmeshServer.prototype.cleanup.call(_this);
    });
    
    return this;
}; // configure

SteelmeshServer.prototype.createServer = function() {
    // create the server
    var app = this.server = express.createServer(),
        logPath = process.env['STEELMESH_REQUESTLOG'],
        format = process.env['STEELMESH_REQUESTLOG_FORMAT'] || 'default',
        stats;
    
    app.configure(function() {
        express.favicon();
        
        // enable jsonp support
        app.enable('jsonp callback');
    });
    
    // TODO: customize log format
    // TODO: making logging configurable on and off...
    if (logPath) {
        try {
            stats = fs.statSync(logPath);
        }
        catch (e) {
        }

        app.use(express.logger({
            format: format,
            buffer: false,
            stream: fs.createWriteStream(logPath, {
                flags: stats ? 'r+' : 'w',
                encoding: 'utf8',
                start: stats ? stats.size : 0
            })
        }));
    }
    
    return app;
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

SteelmeshServer.prototype.getConfig = function() {
    var roConfig = {};
    
    // shallow copy the configuration 
    for (var key in this.config) {
        roConfig[key] = this.config[key];
    } // for
    
    return roConfig;
}; // getConfig

SteelmeshServer.prototype.init = function() {
    
    var mesh = this,
        server = this.server,
        globalAddins = {};
    
    
    // initialise logging
    this.log.info('steelmesh starting');
    this.masterProcess = typeof this.cluster == 'undefined' || this.cluster.isMaster;
    
    // detect the mode we are running in (i.e. slave, master, hive, etc)
    this.detectMode();
    
    // if a cluster worker, then get the apploader to initialize routes
    if (! this.cluster.isMaster) {
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
    } // if
    
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

SteelmeshServer.prototype.loadResource = function(mesh, callback, queryParams, req, res, next) {
    res.ok('got the resource');
};

SteelmeshServer.prototype.restart = function() {
    // initialise
    this.init();
}; // restart

SteelmeshServer.prototype.run = function(callback, innerFn) {
    try {
        var results = innerFn.call(null);
        callback(results);
    }
    catch (e) {
        callback({
            error: e.message
        });
    } // try..catch
};

SteelmeshServer.prototype.saveJobStatus = function() {
    // update the job status file
    fs.writeFile(
        path.resolve('html/_mesh/_jobdata.json'), 
        JSON.stringify({ jobs: this.jobs }), 
        'utf8'
    );
}; // saveJobStatus

/**
### settingRead
*/
SteelmeshServer.prototype.settingRead = function(section, name, callback, reload) {
    // if the settings file has not been opened, then do that now
    if ((! this.settings) || reload) {
        loadSettingsFile(this, function() {
            _this.settingRead(section, name, callback);
        });
    }
    else {
        var sectionData = this.settings[section] || {},
            settingValue = sectionData[name];
            
        if (callback) {
            callback(settingValue);
        } // if
    } // if..else
}; // settingRead

SteelmeshServer.prototype.settingWrite = function(section, name, value, callback) {
    if (! this.settings[section]) {
        this.settings[section] = {};
    } // if

    // update the setting value
    this.settings[section][name] = value;

    // write the settings file
    fs.writeFileSync('settings.json', JSON.stringify(this.settings), 'utf8', callback);
}; // settingWrite

SteelmeshServer.prototype.validateDesign = function(typeName, design, callback) {
    console.log('validating design for type: ' + typeName);
    this.emit('validateDesign', typeName, design);
    
    if (callback) {
        callback();
    } // if
}; // validateDesign

/* Mesh interface implementation */

SteelmeshServer.prototype.loadResource = function(resource, callback) {
    console.log(arguments);
};

SteelmeshServer.prototype.reportError = function(exception, description) {
    console.error('EXCEPTION OCCURED: ' + (description || ''));
    console.error(exception);
    console.error(exception.stack);
};

var _this = module.exports = new SteelmeshServer();

// handle IPC
process.on('message', function(msg) {
    if (msg && msg.cmd) {
        _processMessage(msg.cmd, msg);
    }
});


var path = require('path'),
    fs = require('fs'),
    os = require('os'),
    events = require('events'),
    util = require('util'),
    connect = require('connect'),
    quip = require('quip'),
    url = require('url'),
    winston = require('winston'),
    stackMaster = require('./stackmaster'),
    reHost = /^(.*?)(\..*)$/;
    
/* internal functions */

function detectMode(masterName, callback) {
    var hostname = os.hostname(),
        hostOnly = hostname.replace(reHost, '$1'),
        isMaster = hostOnly.toLowerCase() == masterName.toLowerCase();
        
    if (isMaster) {
        stackMaster.init(function() {
            callback('master');
        });
    }
    else {
        // attempt to connect to the master
        var masterHost = hostname.replace(reHost, masterName + '$2');
        stackMaster.connect(masterHost, function(mode) {
            callback(mode);
        });
    } // if..else
} // detectMode

function loadExtensions(pathExt, stack) {
    var extensions = [],
        extFiles = path.existsSync ? fs.readdirSync(pathExt) : [];
    
    for (var ii = 0; extFiles && ii < extFiles.length; ii++) {
        var extension = require(path.join(pathExt, extFiles[ii]));

        // if the extension has an initialization function, then call it
        if (extension.init) {
            extension.init(stack);
        } // if

        // push the extension
        extensions.push(extension);
    } // for  
    
    return extensions;      
} // loadExtensions

function NodeStack() {
    this.logger = null;
    this.mode = null;
    this.connectors = {};
    this.extensions = [];
    this.config = {
        datapath: 'data',
        logfile: 'stack.log',
        pathExt: path.join(process.cwd(), '/lib/extensions/'),
        master: 'stackm',
        
        urls: [
            'http://localhost:8080/geoserver/wfs'
        ]
    };
} // NodeStack constructor

util.inherits(NodeStack, events.EventEmitter);

NodeStack.prototype.cleanup = function() {
    // iterate through the extensions and given them the opportunity to cleanup
    this.extensions.forEach(function(ext) {
        if (ext.cleanup) {
            ext.cleanup(_this);
        } // if
    });

    this.log('stack shutdown');
}; // cleanup

NodeStack.prototype.createServer = function(logExceptions) {
    var _this = this,
        extensions = this.extensions;
    
    if (logExceptions) {
        process.addListener('uncaughtException', function(error) {
            reportError(null, error);
        });
    } // if
    
    return connect.createServer(
        // initialise connect middleware
        connect.favicon(),
        quip(),

        // define the connect routes
        connect.router(function(app) {
            extensions.forEach(function(ext) {
                if (ext.router) {
                    ext.router(app, _this);
                } // if
            });

            // attach the stack master router
            stackMaster.router(app, _this);
        })
    );
}; // createServer

NodeStack.prototype.getConfig = function() {
    var roConfig = {};
    
    // shallow copy the configuration 
    for (var key in this.config) {
        roConfig[key] = this.config[key];
    } // for
    
    return roConfig;
}; // getConfig

NodeStack.prototype.getConnectors = function() {
    var results = [];
    
    for (var key in this.connectors) {
        results[results.length] = this.connectors[key];
    } // for
    
    return results;
}; // getConnectors

NodeStack.prototype.init = function(initConfig) {
    var extFiles = [],
        _this = this;
    
    function handleTerminate() {
        process.exit();
    } // handleTerminate
    
    // initialise the initialization config to defaults
    initConfig = initConfig || {};
    
    for (var key in initConfig) {
        this.config[key] = initConfig[key];
    } // for
    
    this.logger = new (winston.Logger)({
        transports: [
          new (winston.transports.File)({ filename: this.config.logfile })
        ]
      });
    
    // initialise logging
    this.log();
    this.log('stack starting');
    
    // detect the mode we are running in (i.e. slave, master, hive, etc)
    detectMode(this.config.master, function(mode) {
        _this.mode = mode;
        _this.emit('updateMode', mode);
    });

    // load the extensions (synchronously)
    this.extensions = loadExtensions(this.config.pathExt, this);
    
    // handle stack interrupt
    process.on('SIGINT', handleTerminate);
    process.on('SIGTERM', handleTerminate);
    
    // handle the stack shutdown
    process.on('exit', function() {
        NodeStack.prototype.cleanup.call(_this);
    });
    
    // log the stack initialization
    this.log('stack initialized');
    console.log('in business');
    
    return this;
}; // init

NodeStack.prototype.initLog = function() {
    return require('./log')();
}; // initLog

NodeStack.prototype.loadJobs = function() {
    var shouldLoad = typeof this.cluster == 'undefined' || this.cluster.isMaster;
    
    if (shouldLoad) {
        this.log('loading jobs list');
    } // if
}; // loadJobs

NodeStack.prototype.log = function(message, level) {
    var logLine = process.pid + '|' + 
        (this.cluster && this.cluster.isMaster ? 'M' : 'W') + '|' + 
        (message || '---');
    
    (this.logger || winston).log(level || 'info', logLine);
}; // log

NodeStack.prototype.reportError = function(callback, error) {
    var message,
        stack;

    if (typeof error == 'string') {
        message = error;
    }
    else {
        message = error.message;
        stack = error.stack;
    } // if..else
    
    if (callback) {
        callback({
            error: message,
            stack: stack
        });
    } // if
};

NodeStack.prototype.requireConnector = function(id) {
    var connector = this.connectors[id] || require('./connectors/' + id);

    // add to the list of connectors if it doesn't already exists
    if (! this.connectors[id]) {
        // if the connector has an init function call it
        if (connector.init) {
            connector.init(this);
        } // if
        
        // add to the list of connectors
        this.connectors[id] = connector;
    } // if
    
    return connector;
}; // requireConnector

NodeStack.prototype.run = function(callback, innerFn) {
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

NodeStack.prototype.wrap = function(handlerFn) {
    
    var _this = this;

    function jsonify(cbName, res, output) {
        if (cbName) {
            res.jsonp(cbName, output);
        }
        else {
            res.json(output);
        } // if..else
    } // jsonify

    return function(req, res, next) {
        var queryParams = url.parse(req.url, true).query,
            output = {};

        try {
            handlerFn(_this, function(output) {
                jsonify(queryParams.callback, res, output || { error: 'No results' });
            }, queryParams, req, res, next);
        }
        catch (e) {
            _this.reportError(function(data) {
                jsonify(queryParams.callback, res, data);
            }, e);
        } // try..catch
    };
}; // wrap
    
module.exports = new NodeStack();
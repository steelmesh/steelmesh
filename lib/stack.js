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
    cron = require('cron'),
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

function loadExtensions(config, stack) {
    fs.readdir(config.pathExt, function(err, files) {
        for (var ii = 0; (! err) && ii < files.length; ii++) {
            if (path.extname(files[ii]) == '.js') {
                var extension = require(path.join(config.pathExt, files[ii]));

                // if the extension has an initialization function, then call it
                if (extension.init) {
                    extension.init(stack);
                } // if

                stack.emit('extension', extension);
                stack.log('loaded extension: ' + files[ii]);
            } // if
        } // for  
    });
} // loadExtensions

function loadJobs(config, stack) {
    fs.readdir(config.pathJobs, function(err, files) {
        if (! err) {
            files.forEach(function(jobFile) {
                stack.registerJob(require(path.join(config.pathJobs, jobFile)));
            });
        } // if
    });
} // loadJobs

function NodeStack() {
    this.config = {
        datapath: 'data',
        logfile: 'stack.log',
        pathExt: path.resolve('lib/extensions'),
        pathJobs: path.resolve('lib/jobs'),
        master: 'stackm',
        
        urls: [
            'http://localhost:8080/geoserver/wfs'
        ]
    };

    this.logger = null;
    this.masterProcess = true;
    this.mode = null;
    this.connectors = {};
    this.extensions = [];
    this.jobs = [];
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

NodeStack.prototype.configure = function(initConfig) {
    var extFiles = [];
    
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
    
    return this;
}; // configure

NodeStack.prototype.createServer = function(logExceptions) {
    if (logExceptions) {
        process.addListener('uncaughtException', function(error) {
            reportError(null, error);
        });
    } // if
    
    // create the server
    return connect.createServer(
        // initialise connect middleware
        connect.favicon(),
        quip(),

        // define the connect routes
        connect.router(function(app) {
            _this.on('extension', function(ext) {
                _this.extensions.push(ext);
                
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

NodeStack.prototype.init = function() {
    
    function handleTerminate() {
        process.exit();
    } // handleTerminate
    
    // initialise logging
    this.log();
    this.log('stack starting');
    
    this.masterProcess = typeof this.cluster == 'undefined' || this.cluster.isMaster;
    if (this.masterProcess) {
        loadJobs(this.config, this);
    } // if
    
    // if we are using cluster, then only load extensions for worker processes
    if (typeof this.cluster == 'undefined' || this.cluster.isWorker) {
        // load extensions
        loadExtensions(this.config, this);
    } // if
    
    // detect the mode we are running in (i.e. slave, master, hive, etc)
    detectMode(this.config.master, function(mode) {
        _this.mode = mode;
        _this.emit('updateMode', mode);
    });

    // handle stack interrupt
    process.on('SIGINT', handleTerminate);
    process.on('SIGTERM', handleTerminate);
    
    // handle the stack shutdown
    process.on('exit', function() {
        NodeStack.prototype.cleanup.call(_this);
    });
    
    // log the stack initialization
    this.log('stack initialized');
    this.cluster.emit('init');
}; // init

NodeStack.prototype.initLog = function() {
    return require('./log')();
}; // initLog

NodeStack.prototype.log = function(message, level) {
    var logLine = process.pid + '|' + 
        (this.cluster && this.cluster.isMaster ? 'M' : 'W') + '|' + 
        (message || '---');
    
    (this.logger || winston).log(level || 'info', logLine);
}; // log

NodeStack.prototype.registerJob = function(job) {
    var pattern = job.pattern || '',
        title = job.title || '';

    // parse the pattern and if ok, then schedule the job
    try {
        this.log('found job: "' + title + '" checking pattern: "' + pattern + '"');
        new cron.CronTime(pattern);
        this.log('pattern ok, registering job.');
        this.jobs.push(job);

        new cron.CronJob(pattern, function() {
            _this.runJob(job);
        });
    }
    catch (e) {
        _this.log('could not register job: "' + title + '", pattern "' + pattern + '" not valid.', 'error');
    } // try..catch
}; // registerJob

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

NodeStack.prototype.runJob = function(job) {
    try {
        // run the job
        job.run(this);
        
        // update the time the job was last run
        job.lastRun = new Date();
        
        // update the job status file
        fs.writeFile(
            path.resolve('html/_stack/_jobdata.json'), 
            JSON.stringify({ jobs: this.jobs }), 
            'utf8'
        );
    }
    catch (e) {
        // log the exception
        this.log('error running job "' + (job.title || '') + '"');
    } // try..catch
}; // runJob

NodeStack.prototype.wrap = function(handlerFn) {
    
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
    
var _this = module.exports = new NodeStack();
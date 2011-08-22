var path = require('path'),
    fs = require('fs'),
    os = require('os'),
    events = require('events'),
    util = require('util'),
    async = require('async'),
    connect = require('connect'),
    quip = require('quip'),
    url = require('url'),
    Log = require('log'),
    cron = require('cron'),
    reHost = /^(.*?)(\..*$|$)/;
    
/* internal functions */

function dummyStackFn(mesh, callback) {
    if (callback) {
        callback();
    } // if
} // dummyStackFn

function loadJobs(config, mesh) {
    mesh.log('looking for job files in: ' + config.pathJobs);
    fs.readdir(config.pathJobs, function(err, files) {
        if (! err) {
            files.forEach(function(jobFile) {
                mesh.registerJob(require(path.join(config.pathJobs, jobFile)));
            });
        } // if
        
        mesh.saveJobStatus();
    });
} // loadJobs

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

function Steelmesh() {
    this.config = {
        // define the apploader 
        apploader: 'couch',
        
        // define the couch database configuration
        couchurl: 'http://localhost:5984/',
        appdb: 'meshapps',
        datadb: 'meshdata',

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

    this.logStream = null;
    this.logger = null;
    this.queuedLogs = [];
    this.masterProcess = true;
    this.mode = null;
    this.connectors = {};
    this.jobs = [];
    this.couch = null;
    this.settings = null;
    this.inSync = false;
    
    // initialise the master hostname
    this.masterHost = undefined;
} // Steelmesh constructor

util.inherits(Steelmesh, events.EventEmitter);

Steelmesh.prototype.cleanup = function() {
    this.log('steelmesh shutdown');
    // end the log stream
    this.logStream.end();
}; // cleanup

Steelmesh.prototype.configure = function(initConfig) {
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
        Steelmesh.prototype.cleanup.call(_this);
    });
    
    return this;
}; // configure

Steelmesh.prototype.createServer = function(logExceptions) {
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
            _this.on('route', function(route) {
                app[(route.method || 'GET').toLowerCase()](route.path, route.handler);
            });
            
            // when a connector is created, hook into the router
            _this.on('connector', function(connector) {
                if (connector.router) {
                    connector.router(app, _this);
                } // if
            });
        })
    );
}; // createServer

Steelmesh.prototype.detectMode = function(callback) {
    var hostname = os.hostname(),
        isMaster = hostname.replace(this.config.farmRegex, '$1').toLowerCase() === 
            this.config.farmMaster.toLowerCase();
        
    // if we are on the warchief box, then the master process is the warchief and 
    // the worker process is the highlander (there can be only one)
    this.mode = this.masterProcess ? (isMaster ? 'master' : 'slave') : 'worker';
    
    if (! isMaster) {
        this.masterHost = 'master' + hostname.replace(this.config.farmRegex, '$2');
    } // if

    this.log('steelmesh initialized, mode = ' + this.mode);
    this.emit('updateMode', this.mode);
}; // detectMode

Steelmesh.prototype.getConfig = function() {
    var roConfig = {};
    
    // shallow copy the configuration 
    for (var key in this.config) {
        roConfig[key] = this.config[key];
    } // for
    
    return roConfig;
}; // getConfig

Steelmesh.prototype.getConnectors = function() {
    var results = [];
    
    for (var key in this.connectors) {
        results[results.length] = this.connectors[key];
    } // for
    
    return results;
}; // getConnectors

Steelmesh.prototype.init = function() {
    
    // initialise logging
    this.log();
    this.log('steelmesh starting');
    this.masterProcess = typeof this.cluster == 'undefined' || this.cluster.isMaster;
    
    // detect the mode we are running in (i.e. slave, master, hive, etc)
    this.detectMode();
    
    this.on('couchOK', function() {
        _this.log('CouchDB initialization complete. Completing initialization.');
        
        if (this.masterProcess) {
            loadJobs(_this.config, _this);
        } // if
                
        // load the helpers
        fs.readdir('./lib/helpers', function(err, files) {
            async.forEachSeries(files || [], function(file) {
                require('./helpers/' + file).run(_this);
            });
        });
        
        if (this.masterProcess) {
            this.sendMessage('village.online');
        } // if
    });
    
    // require the couchdb connector
    this.requireConnector('couchdb');
    // this.requireConnector('postgres');
}; // init

Steelmesh.prototype.initLog = function() {
    return require('./log')();
}; // initLog

Steelmesh.prototype.isMaster = function() {
    return this.mode === 'master';
}; // isMaster

Steelmesh.prototype.log = function(message, level) {
    var args = [message || '---'];
        
    // queue the log for writing
    this.queuedLogs.push(args.concat(Array.prototype.slice.call(arguments, 2)));
    
    // if we don't have a logger, but cluster is initialized, then create the logger
    if (! this.logger) {
        var isMaster = typeof this.cluster == 'undefined' || this.cluster.isMaster,
            filename = path.join(
                this.config.pathLogs, 
                (isMaster ? 'master' : 'worker') + '-' + process.pid + '.log'
            );
        
        // create the logger
        this.logStream = fs.createWriteStream(filename);
        this.logger = new Log(Log.DEBUG, this.logStream);
    } // if
    
    // if we have a logger, then log
    if (this.logger) {
        for (var ii = 0, entryCount = this.queuedLogs.length; ii < entryCount; ii++) {
            this.logger.log(level || 'INFO', this.queuedLogs[ii]);
        } // for
        
        this.queuedLogs = [];
    } // if
}; // log

Steelmesh.prototype.registerJob = function(job) {
    var pattern = job.pattern || '',
        title = job.title || '';

    // parse the pattern and if ok, then schedule the job
    try {
        this.log('found job: "' + title + '" checking pattern: "' + pattern + '"');
        new cron.CronTime(pattern);
        
        if (job.run) {
            this.log('pattern ok, registering job.');
            this.jobs.push(job);

            job.cron = new cron.CronJob(pattern, function() {
                _this.runJob(job);
            });
        }
        else {
            this.log('no run handler for job, not registering');
        } // if..else
    }
    catch (e) {
        _this.log('could not register job: "' + title + '", pattern "' + pattern + '" not valid.', 'error');
    } // try..catch
}; // registerJob

Steelmesh.prototype.reportError = function(callback, error) {
    var message,
        mesh;

    if (typeof error == 'string') {
        message = error;
    }
    else {
        message = error.message;
        mesh = error.mesh;
    } // if..else
    
    if (callback) {
        callback({
            error: message,
            mesh: mesh
        });
    } // if
};

Steelmesh.prototype.requireConnector = function(id) {
    var connector = this.connectors[id] || require('./connectors/' + id);
    
    // add to the list of connectors if it doesn't already exists
    if (! this.connectors[id]) {
        if (connector.init) {
            connector.init(this);
        } // if

        // add to the list of connectors
        _this.connectors[id] = connector;
        
        // emit the newConnector event
        _this.emit('connector', connector);
    } // if
    
    return connector;
}; // requireConnector

Steelmesh.prototype.restart = function() {
    // iterate through the jobs and if they have a cron job running,
    // cancel them
    for (var ii = 0; ii < this.jobs.length; ii++) {
        if (this.jobs[ii].cron) {
            clearInterval(this.jobs[ii].cron.timer);
        } // if
    } // for
    
    this.jobs = [];
    
    // reset connectors
    this.connectors = {};
    
    // initialise
    this.init();
}; // restart

Steelmesh.prototype.run = function(callback, innerFn) {
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

Steelmesh.prototype.runJob = function(job) {
    try {
        // run the job
        job.run(this);
        
        // update the time the job was last run
        job.lastRun = new Date();
        
        this.saveJobStatus();
    }
    catch (e) {
        // log the exception
        this.log('error running job "' + (job.title || '') + '"');
    } // try..catch
}; // runJob

Steelmesh.prototype.saveJobStatus = function() {
    // update the job status file
    fs.writeFile(
        path.resolve('html/_mesh/_jobdata.json'), 
        JSON.stringify({ jobs: this.jobs }), 
        'utf8'
    );
}; // saveJobStatus

/**
### sendMessage
*/
Steelmesh.prototype.sendMessage = function(changeType, changeData) {
    if (this.changeLogger) {
        this.changeLogger.write(this, changeType, changeData);
    } // if
}; // sendChange

/**
### settingRead
*/
Steelmesh.prototype.settingRead = function(section, name, callback, reload) {
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

Steelmesh.prototype.settingWrite = function(section, name, value, callback) {
    if (! this.settings[section]) {
        this.settings[section] = {};
    } // if

    // update the setting value
    this.settings[section][name] = value;

    // write the settings file
    fs.writeFileSync('settings.json', JSON.stringify(this.settings), 'utf8', callback);
}; // settingWrite

Steelmesh.prototype.validateDesign = function(typeName, design, callback) {
    console.log('validating design for type: ' + typeName);
    this.emit('validateDesign', typeName, design);
    
    if (callback) {
        callback();
    } // if
}; // validateDesign

Steelmesh.prototype.wrap = function(handlerFn) {
    
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
    
var _this = module.exports = new Steelmesh();
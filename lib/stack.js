var path = require('path'),
    fs = require('fs'),
    connect = require('connect'),
    quip = require('quip'),
    url = require('url'),
    winston = require('winston'),
    connectors = {},
    config = {
        datapath: 'data',
        logfile: 'stack.log',
        pathExt: path.join(process.cwd(), '/lib/extensions/'),
        reMaster: /^geostack\-master/i,
        
        urls: [
            'http://localhost:8080/geoserver/wfs'
        ]
    },
    logger;
    
module.exports = (function() {

    /* internals */
    
    var extFiles = path.existsSync(config.pathExt) ? 
            fs.readdirSync(config.pathExt) : 
            [],
        extensions = [];
        
    function cleanupStack() {
        // iterate through the extensions and given them the opportunity to cleanup
        extensions.forEach(function(ext) {
            if (ext.cleanup) {
                ext.cleanup(_this);
            } // if
        });
        
        log('stack shutdown');
        
        // write a console log entry to confirm that we cleaned up ok
        console.log('stack shutdown complete');
    } // cleanupStack
    
    function extendConfig() {
        var args = arguments,
            config = {};

        // insert the base config
        Array.prototype.splice.call(args, 0, 0, config);

        // iterate through the args
        for (var ii = 0; ii < args.length; ii++) {
            var src = args[ii];
            for (var key in src) {
                config[key] = src[key];
            } // for
        } // for
        
        return config;
    } // extendConfig
    
    function handleTerminate() {
        log('received SIGINT or SIGTERM, exiting...');
        
        // exit
        process.exit();
    } // handleTerminate
    
    function initLogging() {
        logger = new (winston.Logger)({
            transports: [
              new (winston.transports.File)({ filename: config.logfile })
            ]
          });
    } // initLogging
    
    function loadExtensions() {
        for (var ii = 0; extFiles && ii < extFiles.length; ii++) {
            var extension = require(path.join(config.pathExt, extFiles[ii]));

            // if the extension has an initialization function, then call it
            if (extension.init) {
                extension.init(_this);
            } // if

            log('loaded extension: ' + extFiles[ii]);

            // push the extension
            extensions.push(extension);
        } // for        
    } // loadExtensions
    
    /* exports */

    function createServer(logExceptions) {
        if (logExceptions) {
            process.addListener('uncaughtException', function(error) {
                reportError(null, error);
            });
        } // if
        
        return connect.createServer(
            // initialise connect middleware
            connect.favicon(),
            connect.logger(),
            quip(),

            // define the connect routes
            connect.router(function(app) {
                extensions.forEach(function(ext) {
                    if (ext.router) {
                        ext.router(app, _this);
                    } // if
                });
            })
        );
    };

    function getConfig() {
        var roConfig = {};
        
        // shallow copy the configuration 
        for (var key in config) {
            roConfig[key] = config[key];
        } // for
        
        return roConfig;
    } // getConfig
    
    function getConnectors() {
        var results = [];
        
        for (var key in connectors) {
            results[results.length] = connectors[key];
        } // for
        
        return results;
    } // getConnectors

    function init(initConfig) {
        // initialise the initialization config to defaults
        initConfig = initConfig || {};
        
        for (var key in initConfig) {
            config[key] = initConfig[key];
        } // for
        
        return _this;
    } // init
    
    function initLog() {
        return require('./log')();
    } // initStats
    
    function log(message, level) {
        (logger || winston).log(level || 'info', message || '---');
    } // log

    function reportError(callback, error) {
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
    
    function requireConnector(id) {
        var connector = connectors[id] || require('./connectors/' + id);

        // add to the list of connectors if it doesn't already exists
        if (! connectors[id]) {
            connector.id = id;
            connectors[id] = connector;
        } // if
        
        return connector;
    } // requireConnector

    function run(callback, innerFn) {
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
    
    function wrap(handlerFn) {

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
                reportError(function(data) {
                    jsonify(queryParams.callback, res, data);
                }, e);
            } // try..catch
        };
    } // wrap

    /* initialization */

    var _this = {
        createServer: createServer,
        getConfig: getConfig,
        getConnectors: getConnectors,
        init: init,
        log: log,
        reportError: reportError,
        requireConnector: requireConnector,
        run: run,
        wrap: wrap
    };
    
    initLogging();
    log();
    log('stack starting');

    loadExtensions();
    
    // handle stack interrupt
    process.on('SIGINT', handleTerminate);
    process.on('SIGTERM', handleTerminate);
    
    // handle the stack shutdown
    process.on('exit', cleanupStack);
    
    // log the stack initialization
    log('stack initialized');
    
    return _this;
})();
var config = require('config'),
    swig = require('swig'),
    plug = require('plug'),
    fs = require('fs'),
    path = require('path'),
    logger = require('./helpers/logger'),
    log = logger('dashboard', {
        flushInterval: config.logFlushInterval
    }),
    logpath = path.resolve(__dirname, '../logs'),
    pathAssets = path.resolve(__dirname, '../assets', 'dashboard'),
    _ = require('underscore'),
    express = require('express'),
    replimate = require('replimate'),
    server = express.createServer(),
    defaultData = {
        title: 'Steelmesh Admin Dashboard',
        apps: activeApps,
        nav: []
    },
    state = {
        status: 'shutdown',
        
        online: false,
        shutdown: true,
        serverup: false
    },
    activeApps = {},
    dataLoaders = {},
    reLeadingSlash = /^\//,
    _dash = new Dashboard(),
    _controllers = plug.create(server, _dash),
    _plugger = plug.create(server, config, _dash),
    _pluginViews = {};
    
function Dashboard() {
    this.apps = {};
    this.mode = 'primary';
    this.assetsPath = pathAssets;
    this.serverPath = path.resolve(__dirname, '../');
    this.status = 'unknown';
    this.log = log;
    
    // initialise the couchurl
    this.couchurl = config.couchurl;
    
    // if we have admin settings, then use that couchurl if set
    if (config.admin) {
        this.couchurl = config.admin.couchurl || this.couchurl;
    }
}

Dashboard.prototype.detectMode = function(callback) {
    var dashboard = this;
    
    replimate(this.couchurl, function(err, data) {
        if (err) {
            log.debug('error getting replication information from: ' + dashboard.couchurl, err);
        }
        
        // reset the dashboard mode to primary
        dashboard.mode = 'primary';
        
        // iterate through the rows and check if we have replication
        // rules targeting the local steelmesh database
        (data || []).forEach(function(rule) {
            if (rule.target === config.meshdb) {
                log.debug('detected replication rule targeting meshdb (' + config.meshdb + ') ', rule);
                
                // if the replication is active (triggered), then mark as a secondary node
                if (rule._replication_state === 'triggered') {
                    log.debug('dashboard set to secondary node mode');
                    dashboard.mode = 'secondary';
                }
            }
        });
        
        if (callback) {
            callback(dashboard.mode);
        }
    });
};

Dashboard.prototype.updateConfig = function(cfg, callback, restart) {
    var messenger = this.messenger,
        cfgfile = path.resolve(this.serverPath, 'config/runtime.json'),
        existing = {};
        
    fs.readFile(cfgfile, 'utf8', function(err, data) {
        if (! err) {
            try {
                existing = JSON.parse(data);
            }
            catch (e) {
                log.error('Error parsing runtime config, resetting', e);
            }
        }
            
        fs.writeFile(cfgfile, JSON.stringify(_.extend(existing, cfg)), 'utf8', function(err) {
            // TODO: improve restart by only restarting on changes
            if (restart && messenger) {
                messenger.send('steelmesh-restart');
            }
            
            if (callback) {
                callback(err);
            }
        });
    });
    // load the runtime config
};

Dashboard.prototype.restart = function(callback) {
    this.detectMode(function(mode) {
        // find the dash plugins
        _plugger.find(path.resolve(__dirname, 'plugins', 'dash'));
        
        if (callback) {
            callback(mode);
        }
    });
}; // restart
    
// handle uncaught exceptions
process.on('uncaughtException', function (err) {
    log.error('Unhandled exception: ' + (err ? err.message : ''), err);
    console.log(err.stack);
});

// private functions
    
function _getPageData(req, page, callback) {
    if (dataLoaders[page]) {
        dataLoaders[page](req, page, function(data) {
            callback(_.extend({ dash: _dash }, defaultData, state, data));
        });
    }
    else {
        fs.readFile(path.resolve(__dirname, 'pagedata', page + '.json'), 'utf8', function(err, data) {
            callback(_.extend({ dash: _dash }, defaultData, state, data));
        });
    }
} // _getPageData

function _processDropActions(actionList) {
    (actionList || []).forEach(function(actionData) {
        var handler = _dropActionHandlers[actionData.action];
        if (handler) {
            handler.call(null, actionData);
        }
    });
}

function _renderPage(req, res, page, baseData, next) {
    var targetPage = path.resolve(pathAssets, 'views', page);
    
    path.exists(targetPage + '.swig', function(exists) {
        targetPage += exists ? '.swig' : '.html';
        
        log.debug('received request to render page: ' + page + ', fullpath = ' + targetPage);

        _getPageData(req, page, function(data) {
            var renderData = _.extend({
                page: page,
                messages: req.messages
            }, baseData, data);

            // if the page is a plugin view, then render the template
            if (_pluginViews[page]) {
                res.render(_pluginViews[page], renderData);
            }
            // otherwise, look for one of the existing templates
            else {
                path.exists(targetPage, function(exists) {
                    if (exists) {
                        res.render(targetPage, renderData);
                    }
                    else {
                        next();
                    }
                });
            }
        });
    });
}

// ensure we have the uploads and package-archive directorys
fs.mkdir(path.join(pathAssets, 'uploads'));
// fs.mkdir(path.resolve(__dirname, 'package-archive'));

// initialise the data loaders
// dataLoaders.replication = replicationHelper.getData;

// configure the server
server.configure(function() {
    swig.init({
        cache: false,
        root: path.join(pathAssets, 'views'),
        allowErrors: true 
    });
    
    server.set('views', path.join(pathAssets, 'views'));
    server.register('.html', swig);
    server.set('view engine', 'swig');
    server.set('view options', { layout: false });
    
    // server.use(express.bodyParser());
    
    express.favicon();
});

server.use(express['static'](path.join(pathAssets, 'public'), { maxAge: config.dashboard.maxAge || 0 }));

server.use(function(req, res, next) {
    res.message = function(text, type) {
        res.json({
            messages: [{ type: type || 'notice', text: text }]
        });
    };

    next();
});

// explicitly set the router location
server.use(server.router);

// find the controllers
_controllers.find(path.resolve(__dirname, 'helpers/controllers'));

// handle server routes
server.use(function(req, res, next) {
    if (req.url === '/') {
        req.url = '/index';
    }

    _renderPage(req, res, req.url.replace(reLeadingSlash, ''), {}, next);
});

server.listen(config.dashboard.port);

_dash.detectMode(function() {
    // create the apploader
    require('./helpers/apploader').init(config, log, function(apploader) {
        _dash.apploader = apploader;
        
        require('./helpers/messaging').create(function(messenger) {
            // save a reference to the dash messenger
            _dash.messenger = messenger;

            // create the monitor bridge
            _dash.monitorBridge = messenger.bridge('monitor');

            // wire up the messenger
            messenger.on('app', function(appData) {
                if (appData.id) {
                    _dash.apps[appData.id] = appData;
                }

                if (appData.path) {
                    log.debug('application loaded: ' + appData.id + ', path = ' + appData.path);
                    _plugger.find(path.resolve(appData.path, 'lib', 'plugins', 'dash'));
                }
            });

            messenger.on('clearapps', function() {
                _dash.apps = {};
            });    

            messenger.on('status', function(status) {
                _dash.status = status;
                state.status = status;
                state.online = status === 'online';
                state.shutdown = false;
            });

            // send the dash ready message
            messenger.send('dashboard-ready');

            // find the dash plugins
            _plugger.find(path.resolve(__dirname, 'plugins', 'dash'));
        });
    });
});


_plugger.on('connect', function(pluginName, pluginData, modulePath) {
    _.extend(dataLoaders, pluginData.loaders);
    _.extend(_pluginViews, pluginData.views);

    // add navigation items
    defaultData.nav = defaultData.nav.concat(pluginData.nav || []);
    log.debug('dashboard plugin (' + modulePath + '), loaded successfully');
});

_plugger.on('removeNav', function(data) {
    log.debug('removing nav: ' + data.url);
    defaultData.nav = _.reject(defaultData.nav, function(navItem) {
        return data.url && data.url === navItem.url;
    });
});

_plugger.on('dropLoader', function(data) {
    if (data.loader) {
        delete dataLoaders[data.loader];
    }
});

_plugger.on('dropView', function(data) {
    if (data.view) {
        delete _pluginViews[data.view];
    }
});
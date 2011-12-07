var config = require('config'),
    debug = require('debug')('steelmesh-dash'),
    swig = require('swig'),
    fs = require('fs'),
    path = require('path'),
    logger = require('./helpers/loggers/worker'),
    log = logger.writer,
    logpath = path.resolve(__dirname, '../logs'),
    pathAssets = path.resolve(__dirname, '../assets', 'dashboard'),
    _ = require('underscore'),
    express = require('express'),
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
    _plugger = require('plug').create(server, config, _dash),
    _pluginViews = {};
    
function Dashboard() {
    this.apps = {};
    this.assetsPath = pathAssets;
    this.serverPath = path.resolve(__dirname, '../');
}

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
    
// initialise the logger type
process.env['STEELMESH_LOGGER_TYPE'] = 'DSH';

// handle uncaught exceptions
process.on('uncaughtException', function (err) {
    log.error('Unhandled exception: ' + (err ? err.message : ''), err);
    console.log(err.stack);
});

// private functions
    
function _getPageData(req, page, callback) {
    if (dataLoaders[page]) {
        dataLoaders[page](req, page, function(data) {
            callback(_.extend({}, defaultData, state, data));
        });
    }
    else {
        fs.readFile(path.resolve(__dirname, 'pagedata', page + '.json'), 'utf8', function(err, data) {
            callback(_.extend({}, defaultData, state, data));
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
    var targetPage = path.resolve(pathAssets, 'views', page + '.html');
    debug('received request to render page: ' + page + ', fullpath = ' + targetPage);
    
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
                    res.render(page, renderData);
                }
                else {
                    next();
                }
            });
        }
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
    server.set('view engine', 'html');
    server.set('view options', { layout: false });
    
    // server.use(express.bodyParser());
    
    express.favicon();
});




// initialise helpers
// replicationHelper.init(server, config, steelmeshPath);

/*
server.post('/deploy', function(req, res) {
    // process the package upload
    _renderPage(req, res, 'deploy');
});
*/

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
server.get('/up', function(req, res) {
    res.json({ server: state.serverup ? 'up': 'down' });
});

// handle server routes
server.use(function(req, res, next) {
    if (req.url === '/') {
        req.url = '/index';
    }

    _renderPage(req, res, req.url.replace(reLeadingSlash, ''), {}, next);
});

server.listen(config.dashboard.port);

require('./helpers/messaging').create(function(messenger) {
    // save a reference to the dash messenger
    _dash.messenger = messenger;
    
    // wire up the messenger
    messenger.on('app', function(appData) {
        if (appData.id) {
            _dash.apps[appData.id] = appData;
        }

        if (appData.path) {
            _plugger.find(path.resolve(appData.path, 'lib', 'plugins', 'dash'));
        }
    });
    
    messenger.on('clearapps', function() {
        _dash.apps = {};
    });    
    
    messenger.on('status', function(status) {
        state.status = status;
        state.online = status === 'online';
        state.shutdown = false;
    });
    
    messenger.on('serverup', function(available) {
        state.serverup = available;
    });

    // send the dash ready message
    messenger.send('dashboard-ready');
    
    // find the dash plugins
    _plugger.find(path.resolve(__dirname, 'plugins', 'dash'));
});

_plugger.on('connect', function(pluginName, pluginData, modulePath) {
    _.extend(dataLoaders, pluginData.loaders);
    _.extend(_pluginViews, pluginData.views);

    // add navigation items
    defaultData.nav = defaultData.nav.concat(pluginData.nav || []);
    debug('dashboard plugin (' + modulePath + '), loaded successfully');
});

_plugger.on('removeNav', function(data) {
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

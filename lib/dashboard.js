var config = require('config'),
    debug = require('debug')('steelmesh-dash'),
    hbs = require('hbs'),
    fs = require('fs'),
    path = require('path'),
    parted = require('parted'),
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
        nav: [
            { url: '/system', title: 'System' }
        ]
    },
    state = {
        apps: [],
        status: 'shutdown',
        
        online: false,
        shutdown: true
    },
    activeApps = {},
    dataLoaders = {},
    reLeadingSlash = /^\//,
    _dropActionHandlers = {},
    _activePlugins = {},
    _messenger;
    
// initialise the logger type
process.env['STEELMESH_LOGGER_TYPE'] = 'DSH';

// handle uncaught exceptions
process.on('uncaughtException', function (err) {
    log.error('Unhandled exception: ' + (err ? err.message : ''), err);
    console.log(err.stack);
});

// create the drop action handlers

_dropActionHandlers.removeNav = function(data) {
    defaultData.nav = _.reject(defaultData.nav, function(navItem) {
        return data.url && data.url === navItem.url;
    });
};

_dropActionHandlers.dropLoader = function(data) {
    dataLoaders = _.reject(dataLoaders, function(handler, key) {
        return data.loader && key === data.loader;
    });
};

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

function _findPlugins(pluginPath) {
    debug('looking for app plugins in: ' + pluginPath);
    fs.readdir(pluginPath, function(err, files) {
        (files || []).forEach(function(file) {
            _loadPlugin(path.join(pluginPath, file));
        });
    });
} // _findPlugins

function _loadPlugin(modulePath) {
    try {
        // grab the base name of the plugin
        var pluginName = path.basename(modulePath, '.js'),
            activePlugin = _activePlugins[pluginName],
            plugin;
        
        // if the plugin is already loaded, then drop it
        if (activePlugin) {
            debug('active plugin found for "' + pluginName + '", attempting drop');
            if (activePlugin.drop) {
                _processDropActions(activePlugin.drop(server, config));
            }
            
            delete _activePlugins[pluginName];
        }
        
        debug('loading dashboard plugin "' + pluginName + '" from: ' + modulePath);
        
        // clear the require cache 
        require.cache[modulePath] = undefined;
        
        // load the plugin
        plugin = require(modulePath);
        
        // connect the plugin
        plugin.connect(server, config, function(pluginData) {
            _.extend(dataLoaders, pluginData.loaders);

            // add navigation items
            defaultData.nav = defaultData.nav.concat(pluginData.nav || []);
            debug('dashboard plugin (' + modulePath + '), loaded successfully');
            
            // update the active plugins
            _activePlugins[pluginName] = plugin;
        });
    }
    catch (e) {
        // plugin load failed
        // TODO: log
        console.log(e, e.stack);
    }
}

function _processDropActions(actionList) {
    (actionList || []).forEach(function(actionData) {
        var handler = _dropActionHandlers[actionData.action];
        if (handler) {
            handler.call(null, actionData);
        }
    });
}

function _renderPage(req, res, page, baseData, next) {
    var targetPage = path.resolve(pathAssets, 'views', page + '.handlebars');
    
    _getPageData(req, page, function(data) {
        var renderData = _.extend({
            page: page,
            messages: req.messages
        }, baseData, data);
        
        path.exists(targetPage, function(exists) {
            if (exists) {
                res.render(page + '.handlebars', renderData);
            }
            else {
                next();
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
    server.set('views', path.join(pathAssets, 'views'));
    server.register('.handlebars', hbs);
    server.set('view engine', 'hbs');

    server.use(parted({ path: path.join(pathAssets, 'uploads'), stream: true }));
    express.favicon();
});

server.use(function(req, res, next) {
    req.messages = [];
    req.message = function(text, type) {
        req.messages.push({ type: type || 'notice', text: text });
    };

    next();
});

// initialise helpers
// replicationHelper.init(server, config, steelmeshPath);

/*
server.post('/deploy', function(req, res) {
    // process the package upload
    _renderPage(req, res, 'deploy');
});
*/

server.use(express.static(path.join(pathAssets, 'public'), { maxAge: config.dashboard.maxAge || 0 }));

// handle server routes
server.use(function(req, res, next) {
    if (req.url === '/') {
        req.url = '/index'
    }
    
    _renderPage(req, res, req.url.replace(reLeadingSlash, ''), {}, next);
});

server.listen(config.dashboard.port);

require('./helpers/messaging').create(function(messenger) {
    // wire up the messenger
    messenger.on('app', function(appData) {
        if (appData.id) {
            activeApps[appData.id] = appData;
            state.apps = _.values(activeApps);
        }
        
        if (appData.path) {
            _findPlugins(path.resolve(appData.path, 'lib', 'dash-plugins'));
        }
    });
    
    messenger.on('status', function(status) {
        state.status = status;
        state.online = status === 'online';
        state.shutdown = false;
    });
    
    messenger.send('dash-ready');
});

_findPlugins(path.resolve(__dirname, 'helpers', 'dash'));
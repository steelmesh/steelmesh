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
        apps: [],
        status: 'shutdown',
        
        online: false,
        shutdown: true
    },
    activeApps = {},
    dataLoaders = {},
    reLeadingSlash = /^\//,
    _dash = {
        messenger: null
    },
    _plugger = require('plug').create(server, config, _dash);
    
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
    
    _getPageData(req, page, function(data) {
        var renderData = _.extend({
            page: page,
            messages: req.messages
        }, baseData, data);
        
        path.exists(targetPage, function(exists) {
            if (exists) {
                res.render(page, renderData);
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
    swig.init({
        root: path.join(pathAssets, 'views'),
        allowErrors: true 
    });
    
    server.set('views', path.join(pathAssets, 'views'));
    server.register('.html', swig);
    server.set('view engine', 'html');
    server.set('view options', { layout: false });

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
    // save a reference to the dash messenger
    _dash.messenger = messenger;
    
    // wire up the messenger
    messenger.on('app', function(appData) {
        if (appData.id) {
            activeApps[appData.id] = appData;
            state.apps = _.values(activeApps);
        }
        
        if (appData.path) {
            _plugger.find(path.resolve(appData.path, 'lib', 'plugins', 'dash'));
        }
    });
    
    messenger.on('status', function(status) {
        state.status = status;
        state.online = status === 'online';
        state.shutdown = false;
    });

    // send the dash ready message
    messenger.send('dashboard-ready');
    
    // find the dash plugins
    _plugger.find(path.resolve(__dirname, 'plugins', 'dash'));
});

_plugger.on('connect', function(pluginName, pluginData, modulePath) {
    _.extend(dataLoaders, pluginData.loaders);

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
    dataLoaders = _.reject(dataLoaders, function(handler, key) {
        return data.loader && key === data.loader;
    });
});
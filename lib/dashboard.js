var config = require('config'),
    debug = require('debug')('steelmesh-dash'),
    hbs = require('hbs'),
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
        nav: [
            { url: '/system', title: 'System' },
            { url: '/logs', title: 'Logs' }
        ]
    },
    dataLoaders = {},
    reLeadingSlash = /^\//,
    redisClient;
    
// initialise the logger type
process.env['STEELMESH_LOGGER_TYPE'] = 'DSH';
    
dataLoaders.index = function(req, page, statusData, callback) {
    try {
        callback({
            apps: statusData.apps ? JSON.parse(statusData.apps) : [],
            addins: statusData.addins ? JSON.parse(statusData.addins): []
        });
    } 
    catch (e) {
        callback();
    }
};
    
function _getPageData(req, page, callback) {
    function loadPageData(statusData) {
        if (dataLoaders[page]) {
            dataLoaders[page](req, page, statusData, function(data) {
                callback(_.extend({}, defaultData, statusData, data));
            });
        }
        else {
            fs.readFile(path.resolve(__dirname, 'pagedata', page + '.json'), 'utf8', function(err, data) {
                callback(_.extend({}, defaultData, statusData, data));
            });
        }
    }
    
    if (redisClient) {
        redisClient.HGETALL('steelmesh', function(err, obj) {
            if (obj) {
                obj.online = obj.status === 'online';
                obj.shutdown = obj.status === 'shutdown';
            }
            
            loadPageData(obj);
        });
    }
    else {
        loadPageData();
    }
} // _getPageData

function _initRedis(config) {
    // if the redis client is already assigned, then do nothing
    if (redisClient) {
        return;
    }
    
    var client = require('redis').createClient(config.redis.port, config.redis.host);
    client.on('ready', function() {
        redisClient = client;
    });
    
    client.subscribe('steelmesh',)

    // TODO: redis error handling
    client.on('error', function() {
    });
} // _initRedis

function _makePublisher(config) {
    return function(req, res) {
        var appid = req.param('appid'),
            version = req.param('version'),
            packagePath = path.resolve(__dirname, 'package-archive', appid, version),
            messages = [];
            
        // extend the config with the appid
        config = _.extend({}, config, { appid: appid });
        
        // update the couch url to use the admin couchurl
        if (config.admin) {
            config.couchurl = config.admin.couchurl || config.couchurl;
        }
            
        // initialise the mesh tools
        mesh.init(_.extend({}, config, { path: packagePath }), function(err, instance) {
            instance.getAction('publish').call(instance, config, function(actionErr, results) {
                if (actionErr) { 
                    req.message('Unable to publish package', 'error');
                }
                else {
                    req.message('Published Application: ' + appid + ' (version ' + version + ')', 'success');
                }
                
                _renderPage(req, res, 'deploy');
            });
        });
    };
} // _makePublisher

function _renderPage(req, res, page, baseData) {
    var targetPage = path.resolve(__dirname, 'views', page + '.handlebars');
    
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
                res.render('index.handlebars',renderData);
            }
        });
    });
}

// ensure we have the uploads and package-archive directorys
// fs.mkdir(path.resolve(__dirname, 'uploads'));
// fs.mkdir(path.resolve(__dirname, 'package-archive'));

// initialise redis
_initRedis(config);

// initialise the data loaders
// dataLoaders.deploy = require('./lib/deploy').getData;
// dataLoaders.logs = logloader.getData;
// dataLoaders.replication = replicationHelper.getData;

// configure the server
server.configure(function() {
    server.set('views', path.join(pathAssets, 'views'));
    server.register('.handlebars', hbs);
    server.set('view engine', 'hbs');
    
    express.favicon();
    
    /*
    // use the form extension
    server.use(parted({
        path: path.resolve(__dirname, 'uploads'),
        stream: true
    }));
    */
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
// logloader.init(server, config, steelmeshPath);

// server.get('/exception/:exception', logloader.getException);
// server.get('/deploy/:appid', _makePublisher(config));

/*
server.post('/deploy', function(req, res) {
    // process the package upload
    _renderPage(req, res, 'deploy');
});
*/

server.use(express.static(path.join(pathAssets, 'public'), { maxAge: config.dashboard.maxAge || 0 }));

// handle server routes
server.use(function(req, res) {
    _renderPage(req, res, req.url.replace(reLeadingSlash, ''));
});

server.listen(config.dashboard.port);

process.on('uncaughtException', function (err) {
    log.error('Unhandled exception: ' + (err ? err.message : ''), err);
    console.log(err.stack);
});
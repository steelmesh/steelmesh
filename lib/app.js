var debug = require('debug')('steelmesh'),
    fs = require('fs'),
    path = require('path'),
    events = require('events'),
    nano = require('nano'),
    util = require('util'),
    _ = require('underscore'),
    async = require('async'),
    express = require('express'),
    reHandler = /(.*)\.(.*)$/,
    reJSFile = /\.js$/i,
    _exists = fs.exists || path.exists,
    
    cachedAddins = {},
    modInitialized = {},
    
    addinPrereqs = {
        sessions: ['cookies']
    },
    
    // define some base addins
    baseAddins = {
        bodyparser: function(mesh, instance) {
            instance.use(express.bodyParser());
        },
        
        cookies: function(mesh, instance) {
            // enable cookie parsing and body parsing
            instance.use(express.cookieParser());
        },
        
        exceptions: function(mesh, instance) {
            instance.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
        },
        
        sessions: function(mesh, instance) {
            // set up for session support
            instance.use(express.session({ secret: this.sessionKey || 'meshapp' }));
        }
    };
    
function _getAddin(name) {
    if (! cachedAddins[name]) {
        try {
            cachedAddins[name] = require('./addins/' + name);
        }
        catch (e) {
            try {
                cachedAddins[name] = require('steelmesh-' + name);
            }
            catch (e) {
                // could not load addin from local path or node_modules
            }
        }
    }
    
    return cachedAddins[name];
}

function _connect(meshapp, key, config, baseConfig, callback) {
    var dburl = config.url || baseConfig.couchurl,
        dbname = config.db || key;
    
    // create the connection
    conn = nano(dburl);

    // check to see if the database exists
    conn.db.get(dbname, function(err, res) {
        // if the db doesn't exist and we are allow to create it, then give it a go
        if (err && err.error === 'not_found' && config.autoCreate) {
            conn.db.create(dbname, function(err, res) {
                if (! err) {
                    meshapp[key] = conn.use(dbname);
                }
                
                callback(null, dburl + '/' + dbname);
            });
        }
        else if (! err) {
            meshapp[key] = conn.use(dbname);
            callback(null, dburl + '/' + dbname);
        }
    });
} // _connect

function _loadConfig(app, appPath, callback) {
    var appDefinition = path.join(appPath, 'app.js'),
        appPackage = path.join(appPath, 'package.json'),
        packageProps = ['dependencies', 'version'];
        
    debug('Loading application configuration for app: ' + app.id);
        
    async.series([
        function(taskCb) {
            debug('Looking for definition file: ' + appDefinition);
            _exists(appDefinition, function(exists) {
                if (exists) {
                    // clear the require cache
                    require.cache[appDefinition] = undefined;

                    // load the app configuration
                    _.extend(app, require(appDefinition));
                }
                
                taskCb();
            });
        },
        
        function(taskCb) {
            debug('attempting to load package data from: ' + appPackage);
            
            // attempt to load the package data
            fs.readFile(appPackage, 'utf8', function(err, data) {
                if (! err) {
                    try {
                        _.extend(app.packageData, JSON.parse(data));
                    }
                    catch (e) {
                        debug('Error parsing package data for package: '  + appPackage);
                    }
                }
                else {
                    debug('Unable to load package data from file: ' + appPackage);
                }
                
                taskCb();
            });
        }
    ], callback);
} // _loadConfig
 
/* mesh app definition */

var MeshApp = exports.MeshApp = function(appPath, config) {
    var app = this;
    
    // ensure we have a valid configuration 
    this.basePath = appPath;
    this.baseUrl = '/';
    
    this.id = (config && config.id) ? config.id : path.basename(appPath);
	debug('mesh app id = ' + this.id);
    this.routes = [];
    this.jobs = [];
    
    // initialise the instance to empty
    this.instance = undefined;
    
    // initialise the default addins
    this.addins = [];
    this.globalAddins = {};

    // initial base package data
    this.packageData = config || {};

    // load the config into this app
    _loadConfig(this, appPath, function() {
        // override id if a name is provide in the package data
        app.id = (app.packageData) ? app.packageData.name || app.id : app.id;
        
        // emit thte load event
        app.emit('load');
    });
};

util.inherits(MeshApp, events.EventEmitter);

// TODO: allow this function to fire a callback
MeshApp.prototype.loadAddIns = function(mesh, instance, opts) {
    var app = this,
        requiredAddins = _.map(this.addins, function(addin) { return addin.toLowerCase(); }),
        addinsLength = 0;
        
    while (addinsLength !== requiredAddins.length) {
        // update the addins length
        addinsLength = requiredAddins.length;
        
        // iterate through the required
        requiredAddins.forEach(function(addin) {
            var prereqs = addinPrereqs[addin] || [];
            
            try {
                prereqs = prereqs.concat(_getAddin(addin).prereqs);
            }
            catch (e) {
                // no prereqs, nothing to worry about
            } // try..catch
            
            // add the prereqs to the required addins
            requiredAddins = _.difference(prereqs, requiredAddins).concat(requiredAddins);
        });
        
        // compact and union the addins
        requiredAddins = _.compact(_.uniq(requiredAddins));
    } // while
    
    // iterate through the app addins
    requiredAddins.forEach(function(addin) {
        var addinHandler,
            addinModule;
        
        // find the addin handler
        try {
            addinHandler = baseAddins[addin];
            if (! addinHandler) {
                addinModule = _getAddin(addin);
                addinHandler = addinModule.install;
            } // if
        }
        catch (e) {
            mesh.log.warn('no handler for addin: ' + addin);
        } // try..catch
       
        // if the addin handler has been defined then run it
        if (addinHandler) {
            addinHandler.call(app, mesh, instance, opts);
            mesh.log.info('installed addin: ' + addin);
        } // if
        
        // if we have a global installer, then register than now
        if (addinModule && addinModule.installGlobal) {
            app.globalAddins[addin] = addinModule.installGlobal;
        } // if
    });    
};

MeshApp.prototype.loadResource = function(resource, callback) {
    var targetFile = path.resolve(this.basePath, path.join('resources', resource));
    
    fs.readFile(targetFile, 'utf8', function(err, data) {
        callback(err, data, {
            path: targetFile
        });
    });
};

MeshApp.prototype.middleware = function() {
    var meshapp = this;
    
    return function(req, res, next) {
        // expose the app's mount-point
        // as per: https://github.com/visionmedia/express/blob/master/examples/blog/middleware/locals.js
        // TODO: implement this once supported and remove from dynamic helpers
        // res.locals.appPath = req.app.route;
        
        // patch the meshapp into the request
        req.meshapp = meshapp;
        
        // all we wanted to do was assign some view locals
        // so pass control to the next middleware
        next();
    };
};

MeshApp.prototype.mount = function(mesh, callback, opts) {
    // initialise options
    opts = opts || {};
    
    // create the application instance
    var app = this,
        appPath = this.basePath,
        publics = this.publics || [], /* need add in app.js of application test */
        routes = this.parseRoutes(mesh);
        
        /* Example of app.js of steelmesh-app-test, check new "publics", public html files
            module.exports = {
                _id : 'test',
                baseUrl : '/',
                publics : [{
                    path : '/spec',
                    subDir : '/spec'
                },{
                    path : '/js',
                    subDir : '/js'
                }],
                routes : [{
                    path : '/time',
                    handler : 'test.getTime'
                }]
            };
        
        */
        
    mesh.log.info('creating express instance for app: ' + this.id);
        
    this.wireCouch(mesh.config, function() {
        var instance = this.instance = express.createServer();
        
        // add some dynamic helpers
        instance.dynamicHelpers({
            appPath: function() {
                return '/' == instance.route ? '' : instance.route;
            }
        });

        // serve the public views files
        instance.configure(function() {
            // initialise the view path
            instance.set('basepath', appPath);
            instance.set('views', path.join(appPath,'views'));
    
            // use the meshapp middleware
            instance.use(app.middleware());
			
            // load the addins - THIS NOT WORK - WHY???
            //app.loadAddIns(mesh, instance, opts);
			
        });

        // serve the public static files
        publics.forEach(function(publicData) {
            instance.use(publicData.path.toLowerCase(), express['static'](path.join(appPath,publicData.subDir)));
        });
		
        // connect the routes
        routes.forEach(function(routeData) {
			instance[routeData.method.toLowerCase()](routeData.path, routeData.handler);
            //app.emit('route', routeData);
        });

        if (callback) {
            callback(instance);
        } // if
    });
};

MeshApp.prototype.parseRoutes = function(mesh) {
    var app = this,
        routeHandlers = [],
        match;
    
    this.routes.forEach(function(route) {
        // if the route is a string, then convert into an object
        if (typeof route == 'string') {
            var routeParts = route.split(/\s?=>\s?/);
            
            if (routeParts.length > 1) {
                route = {
                    path: routeParts[0],
                    handler: routeParts[1]
                };
            }
            else {
                return;
            } // if..else
        } // if
        
        // check for a route path
        match = reHandler.exec(route.handler);
        
        if (match) {
            var modulePath = path.resolve(app.basePath, 'lib', match[1] + '.js');
            
            try {
                var module = require(modulePath),
                    handlerFn = module[match[2]];
                    
                // if the module has an init function
                // and the module has not yet been initialized, then initialize it now
                if (typeof module.init == 'function' && (! modInitialized[modulePath])) {
                    module.init(mesh, app);
                    modInitialized[modulePath] = true;
                }

                // if we have a handler function, then handle the route
                if (handlerFn) {
                    routeHandlers.push({
                        method: route.method || 'GET',
                        path: route.path,
                        handler: handlerFn
                    });
                } // if
            }
            catch (e) {
                mesh.log.error('Could not load module: ' + modulePath, e);
            }
        } // if
    });
    
    return routeHandlers;
};

MeshApp.prototype.toJSON = function(dropPersistent) {
    var output = {},
        persistentProps = ['basePath', 'globalAddins', 'id'];
    
    // return the data less the functions
    for (var key in this) {
        if (this.hasOwnProperty(key) && typeof this[key] != 'function') {
            output[key] = this[key];
        }
    }
    
    // if we are including persistent details or it hasn't been specified 
    if (dropPersistent) {
        persistentProps.forEach(function(prop) {
            delete output[prop];
        });
    }
    
    return output;
}; // toJSON

MeshApp.prototype.wireCouch = function(config, callback) {
    // look for the couchdb configuration section
    var meshapp = this,
        conn, dburl, dbname,
        dbs;
        
    dbs = _.map(this.couchdb || {}, function(value, key) {
        if (meshapp[key]) {
            throw new Error('Attempting to load database with invalid dbname: \'' + key + '');
        }
        
        // add the database details to the list of databases we will connect to
        return {
            key: key,
            config: value
        };
    });
        
    // reset the meshapp couchurls
    meshapp.couchurls = {};
    
    async.map(dbs, function(data, itemCallback) {
        _connect(meshapp, data.key, data.config, config, function(err, dbUrl) {
            meshapp.emit('db', 'couch', {
                id: data.key,
                url: dbUrl,
                config: data.config,
                instance: meshapp[data.key]
            });
            
            meshapp.couchurls[data.key] = dbUrl;
            itemCallback(err);
        });
    }, function(err) {
        if (callback) {
            callback(meshapp.couchurls);
        }
    });    
};
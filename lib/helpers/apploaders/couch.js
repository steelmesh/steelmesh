var async = require('async'),
    attachmate = require('attachmate'),
    debug = require('debug')('apploader'),
    nano = require('nano'),
    cluster = require('cluster'),
    mime = require('mime'),
    events = require('events'),
    util = require('util'),
    fs = require('fs'),
    path = require('path'),
    http = require('http'),
    url = require('url'),
    request = require('request'),
    exec = require('child_process').exec,
    Module = require('module').Module,
    MeshApp = require('../../app').MeshApp,
    _ = require('underscore'),
    mappedApps = {},
    reProtected = /^\/[^\/]*\/(app\.js|lib|node_modules|resources|views)/i,
    reAttachmentUrl = /^\/([^\/]+)\/(.*)/,
    reValidStatus = /^[2-3]+/,
    reVersion = /^(.*\/[^\-]*)(\-\d+.*)?(\.\w+)$/,
    reValidMethod = /^(GET|HEAD)$/,
    reSuppressHeader = /^server$/i,
    reJavascriptExt = /\.js$/i,
    reLeadingLibFolder = /^(\/|\/?lib)/i,
    reTrailingSlash = /\/$/,
    _waitTimeout = 5,
    _appPrefix = 'app::';
    
function _autoCreateDb(config, callback) {
    var couch = nano(config.couchurl);

    couch.db.get(config.meshdb, function(err) {
        if (err && err.error === 'not_found') {
            couch.db.create(config.meshdb, callback);
        }
        else if (callback) {
            callback(err);
        }
    });
};

function _findDesigns(config, app, callback) {
    var designs = [];
    
    // iterate through the config and look for designs
    for (var key in app.couchdb) {
        (app.couchdb[key].designs || []).forEach(function(design) {
            designs.push({
                db: key,
                design: design
            });
        });
    }
    
    app.wireCouch(config, function(dbUrls) {
        // iterate through each of the dseigns and upload to the database
        async.forEach(designs, function(data, itemCallback) {
            _uploadDesign(app, config, dbUrls[data.db], data.design, itemCallback);
        }, callback);
    });
} // _findDesigns

function _uploadDesign(app, config, dbUrl, targetDesign, callback) {
    // initialise the path to the design doc
    var ddoc = path.join(app.basePath, 'lib/_designs/' + targetDesign + '.js');
    
    // js file to design doc conversion
    // from mikeal node.couchapp: https://github.com/mikeal/node.couchapp.js/blob/master/main.js#L124
    var p = function (x) {
      for (i in x) {
        if (i[0] != '_') {
          if (typeof x[i] == 'function') {
            x[i] = x[i].toString();
            x[i] = 'function '+x[i].slice(x[i].indexOf('('));
          }
          if (typeof x[i] == 'object') {
            p(x[i]);
          }
        }
      }
    };

    try {
        var designDoc = require(ddoc), existingDoc,
            targetUrl = dbUrl.replace(reTrailingSlash, '') + '/_design/' + targetDesign;
            
        // parse the design doc as per mikeals node.couchapp
        p(designDoc);
            
        // get the existing design
        debug('attempting publish of design doc to: ' + targetUrl);
        request(targetUrl, function(err, res, body) {
            if (! err) {
                designDoc._rev = JSON.parse(body)._rev;
            }
            else {
                debug('received error response from couchdb: ', err);
            }
            
            request({ url: targetUrl, json: designDoc, method: 'PUT' }, callback);
        });
    }
    catch (e) {
        debug('captured error uploading design:', e.stack);
        callback('Unable to upload design: ' + ddoc);
    }
} // _uploadDesign

function _loadModules(mesh, basePath, modulePaths, allowCached, callback) {
    var mods = [];
    
    (modulePaths || []).forEach(function(modulePath) {
        var targetPath = path.resolve(basePath, modulePath.replace(reJavascriptExt, '') + '.js');
        
        try {
            if (! allowCached) {
                // clear the require cache (we wan't a fresh copy if steelmesh is restarted)
                mesh.log.info('clearing require cache for module: ' + targetPath);
                require.cache[targetPath] = undefined;
            }
            
            // require the module
            mods.push(require(targetPath));
        }
        catch (e) {
            mesh.log.error('Unable to load module: ' + targetPath, e);
        }
    });
    
    // trigger the callback (null for the error param)
    callback(null, mods);
} // _loadModules

function CouchAppLoader() {
} // CouchAppLoader

util.inherits(CouchAppLoader, events.EventEmitter);

CouchAppLoader.prototype.init = function(config, log) {
    var loader = this;
    
    _autoCreateDb(config, function(err) {
        if (! err) {
            loader.emit('ready');
        }
        else {
            log.info('No active steelmesh database, checking again in ' + _waitTimeout + ' seconds');
            
            // check the db again in 5 seconds
            setTimeout(function() {
                loader.init(config, log);
            }, _waitTimeout * 1000);
            
            // double the wait timeout
            _waitTimeout *= 2;
        }
    });
};

CouchAppLoader.prototype.loadApps = function(mesh, callback, downloadApps) {
    var apps = [],
        db = nano(mesh.config.couchurl).use(mesh.config.meshdb),
        dbUrl = mesh.config.couchurl.replace(reTrailingSlash, '') + '/' + mesh.config.meshdb,
        appsToLoad = 0;
        
    function finalizeApp(app) {
        if (mesh.messenger) {
            mesh.messenger.send('app', app.toJSON());
        }
        
        if (--appsToLoad <= 0) {
            callback(null, apps);
        }
    } // finishApp
    
    // if downloadApps value has not been specified, then look to the cluster config
    // true for the master process, false otherwise
    downloadApps = typeof downloadApps == 'undefined' ? cluster.isMaster : false;
    mesh.log.info('attempting to load apps from db: ' + mesh.config.couchurl + '/' + mesh.config.meshdb);
    
    // if we have a messenger, then clear the apps
    if (mesh.messenger) {
        mesh.messenger.send('clearapps');
    }
    
    db.view('default', 'apps', function(err, res) {
        if (err) {
            if (err && err.error === 'not_found') {
                callback('Steelmesh database has not been initialized !{yellow}ENOINIT');
            }
            else {
                callback('Unable to connect to steelmesh db (' + err.error + ')');
            }
        }
        else {
            // initialise the list of stack apps
            res.rows.forEach(function(appData) {
                var appid = (appData.value || {}).id || appData.id,
                    appPath = path.resolve(__dirname, '../../apps/' + appid),
                    app;
                    
                // if the appData value contains a mount point, then map the app
                if (appData.value.mountpoint) {
                    mappedApps[appData.value.mountpoint] = appData.id;
                }
                
                // create the mesh app
                app = new MeshApp(appPath, _.extend({
                    id: appid,
                    title: appData.title,
                    baseUrl: '/' + appid + '/'
                }, appData.value));
                
                // attach the mesh logger to the app
                app.log = mesh.log;
                
                // when the application has loaded it's configuration, continue initialization
                app.on('load', function() {
                    mesh.log.info('loaded app: ' + app.id);
                    
                    if (downloadApps) {
                        mesh.log.info('updating app from: ' + dbUrl.replace(reTrailingSlash) + '/' + _appPrefix + appid);
                        attachmate.download(
                            dbUrl.replace(reTrailingSlash) + '/' + _appPrefix + appid, 
                            appPath,
                            function(err) {
                                if (err) {
                                    mesh.log.error('Error downloading app "' + appid + '"', err);
                                }
                                else {
                                    mesh.log.info('Completed downloading app: ' + appid);
                                }
                                
                                finalizeApp(app);
                            }
                        );
                    }
                    else {
                        finalizeApp(app);
                    }
                });
                
                // add the app to the list of apps
                apps.push(app);
                appsToLoad += 1;
            });
        } // if..else
    });
}; // loadApps

CouchAppLoader.prototype.loadPlugins = function(mesh, app, targets, allowCached, callback) {
    // ensure targets has a value, if not defined, we will default to an empty array
    targets = targets || [];
    
    // if the allowCached value is a function, then it's the callback (default cacheable to true)
    if (typeof allowCached == 'function') {
        callback = allowCached;
        allowCached = true;
    }
    
    // if the target is an array, then process directly
    if (Array.isArray(targets)) {
        _loadModules(mesh, app.basePath, _.map(targets, function(file) {
            return path.join('lib', file.replace(reLeadingLibFolder, ''));
        }), allowCached, callback);
    }
    // otherwise look for files in the specified directory
    else {
        fs.readdir(path.resolve(app.basePath, targets), function(err, files) {
            if (! err) {
                // load the modules in the directory
                _loadModules(mesh, app.basePath, _.map(files, function(file) {
                    return path.join(targets, 'lib', file);
                }), allowCached, callback);
            }
            else {
                callback(err);
            }
        });
    }
};

CouchAppLoader.prototype.publish = function(config, app, callback) {
    var couchurl = config.admin.couchurl || config.couchurl,
        targetUrl = couchurl.replace(reTrailingSlash, '') + '/' + config.meshdb + '/' + _appPrefix + app.id,
        opts = {
            docData: app.toJSON(), 
            preserveExisting: false
        };
        
    debug('uploading files (' + app.basePath + ') as attachments to: ' + targetUrl);
    attachmate.upload(targetUrl, app.basePath, opts, function(err) {
        if (! err) {
            _findDesigns(config, app, callback);
        }
        else if (callback) {
            callback(err);
        }
    });
};

CouchAppLoader.prototype.createResourceLoader = function(mesh) {
    var baseUrl = mesh.config.couchurl + '/' + mesh.config.meshdb,
        resCache = {},
        maxAge = 300; // 300 seconds = 5 minutes
        
    return function(req, res, next) {
        var targetDoc = req.url.replace(/^(.*\/)($|\?.*)/, '$1index.html$2'),
            appid, match, docRequest, docRequestTimer,
            activeSocket, targetOptions,
            responseStarted = false,
            targetBuffer, bufferOffset = 0,
            isGet = req.method ? req.method.toUpperCase() === 'GET' : false,
            timedOut = false;
            
        // if the target document does not have an extension, then add .html by default
        targetDoc += path.extname(targetDoc) == '' ? '.html' : '';
            
        // if the requested url is protected, then return a 404
        if (! reValidMethod.test(req.method)) {
            next();
        }
        else if (reProtected.test(targetDoc)) {
            res.send('Not found', 404);
        }
        else if (resCache[targetDoc]) {
            var headers = resCache[targetDoc].headers || {};
            for (var header in headers) {
                res.header(header, headers[header]);
            }
            
            if (resCache[targetDoc].body) {
                res.write(resCache[targetDoc].body);
            }
            
            res.end();
        }
        else {
            // strip the trailing version
            // TODO: this may have to change
            
            // see if the target doc matches the attachment url regex
            match = reAttachmentUrl.exec(targetDoc.replace(reVersion, '$1$3'));

            if (match) {
                // get the mapped application id
                appid = mappedApps[match[1]] || match[1];
                
                // if the appid is not prefixed with app:: then prepend it
                if (appid.slice(0, 5) !== _appPrefix) {
                    appid = _appPrefix + appid;
                } 
                
                debug('requesting: ' + baseUrl + '/' + appid + '/' + match[2]);
                targetOptions = url.parse(baseUrl + '/' + appid + '/' + match[2]);
                targetOptions.method = req.method;
                
                docRequest = http.request(targetOptions, function(couchRes) {
                    if (! timedOut) {
                        var headers = couchRes.headers,
                            docHeaders = {},
                            contentLength = headers ? (headers['content-length'] || headers['Content-Length']) : 0,
                            contentType = mime.lookup(targetDoc),
                            charset = mime.charsets.lookup(contentType);
                            
                        // initialise the response
                        responseStarted = true;
                        targetBuffer = new Buffer(isGet ? parseInt(contentLength || 0, 10) : 0);
                        bufferOffset = 0;
                        
                        // create some headers
                        docHeaders['Date'] = new Date().toUTCString();
                        docHeaders['Content-Type'] = contentType + (charset ? '; charset=' + charset : '');
                        if (contentLength) {
                            docHeaders['Content-Length'] = contentLength;
                        }
                        
                        // TODO: make caching configurable
                        docHeaders['Cache-Control'] = 'public, max-age=' + maxAge;
                        
                        // TODO: accept ranges
                        docHeaders['Accept-Ranges'] = 'none';
                        
                        // TODO: set last modified date, based on the age of the document
                        // docHeaders['Last-Modified'] = stat.mtime.toUTCString();
                        
                        // write the headers to the response
                        for (var header in docHeaders) {
                            res.header(header, docHeaders[header]);
                        }
                        
                        // handle data
                        couchRes.on('data', function(chunk) {
                            if (bufferOffset + chunk.length > targetBuffer.length) {
                                var newBuffer = new Buffer(bufferOffset + chunk.length);

                                targetBuffer.copy(newBuffer);
                                targetBuffer = newBuffer;
                            }
                            
                            // copy the target buffer chunk into the new buffer
                            chunk.copy(targetBuffer, bufferOffset);
                            
                            // increase the buffer offset by the chunk size
                            bufferOffset += chunk.length;
                            
                            // write the chunk to the output stream
                            res.write(chunk);
                        });
                        
                        // handle the response end
                        couchRes.on('end', function() {
                            if (isGet) {
                                // cache the buffer
                                resCache[targetDoc] = {
                                    headers: docHeaders,
                                    body: targetBuffer
                                };
                            }
                            
                            // end the response
                            res.end();
                        });
                    }
                });
                
                docRequest.on('error', function(e) {
                    mesh.log.error('error requesting \'' + targetDoc + '\'', e);
                });
                
                docRequest.setSocketKeepAlive(false);
                docRequest.setTimeout(10000, function() {
                    if (! responseStarted) {
                        // flag as timed out
                        timedOut = true;

                        docRequest.abort();
                        mesh.log.warn('request for \'' + targetDoc + '\' timed out');
                        res.send('Timed out: ' + new Date().getTime(), 500);
                    }
                });
                
                // send the request
                docRequest.end();
            }
            else {
                next();
            }
        } // if..else        
    };
}; // loadResource

module.exports = new CouchAppLoader();
var async = require('async'),
    nano = require('nano'),
    cluster = require('cluster'),
    mime = require('mime'),
    events = require('events'),
    util = require('util'),
    fs = require('fs'),
    path = require('path'),
    http = require('http'),
    url = require('url'),
    exec = require('child_process').exec,
    Module = require('module').Module,
    MeshApp = require('mesh').MeshApp,
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
    _waitTimeout = 5,
    _appPrefix = 'app::';
    
function _autoCreateDb(mesh, callback) {
    var couch = nano(mesh.config.couchurl);

    couch.db.get(mesh.config.meshdb, function(err) {
        if (err && err.error === 'not_found') {
            couch.db.create(mesh.config.meshdb, callback);
        }
        else if (callback) {
            callback(err);
        }
    });
};

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

function checkDirs(directory, callback) {
    var dirMode = 0x1FF;

    // check the existence of the requested directory
    path.exists(directory, function(exists) {
        if (! exists) {
            // check the existence of the parent directory
            path.exists(path.dirname(directory), function(parentExists) {
                // if the parent does not exist, then recurse up the tree
                if (! parentExists) {
                    checkDirs(path.dirname(directory), function() {
                        fs.mkdir(directory, dirMode, callback);
                    });
                }
                // otherwise, create the directory and fire the callback
                else {
                    fs.mkdir(directory, dirMode, callback);
                } // if..else
            });
        }
        else {
            callback();
        } // if..else
    });
} // checkDirs

function getConnection(mesh) {
    return nano(mesh.config.couchurl).use(mesh.config.meshdb);
} // getConnection

function CouchAppLoader() {
} // CouchAppLoader

util.inherits(CouchAppLoader, events.EventEmitter);

CouchAppLoader.prototype.init = function(mesh) {
    _autoCreateDb(mesh, function(err) {
        if (! err) {
            _loader.emit('ready');
        }
        else {
            mesh.log.info('No active steelmesh database, checking again in ' + _waitTimeout + ' seconds');
            
            // check the db again in 5 seconds
            setTimeout(function() {
                _loader.init(mesh);
            }, _waitTimeout * 1000);
            
            // double the wait timeout
            _waitTimeout *= 2;
        }
    });
};

CouchAppLoader.prototype.loadApps = function(mesh, callback, downloadApps) {
    var db = getConnection(mesh);
    
    // if downloadApps value has not been specified, then look to the cluster config
    // true for the master process, false otherwise
    downloadApps = typeof downloadApps == 'undefined' ? cluster.isMaster : false;
    mesh.log.info('attempting to load apps from db: ' + mesh.config.couchurl + '/' + mesh.config.meshdb);
    
    function finishLoad(err, apps) {
        if (cluster.isMaster && mesh.messenger) {
            apps.forEach(function(appData) {
                mesh.messenger.send('app', {
                    id: appData.id, 
                    title: appData.title,
                    path: appData.basePath,
                    mountpoint: appData.mountpoint,
                    addins: appData.addins
                });
            });
        }
        
        if (callback) {
            callback(err, apps);
        } // if
    }
    
    function downloadApp(appData, appCallback) {
        var libs = appData.value.libs || [],
            attachmentsToDownload = libs.length;
        
        if (attachmentsToDownload > 0) {
            mesh.log.info('synchronizing application: ' + appData.key);
            
            // drop the directory
            exec('rm -r ' + appData.path, function() {
                // iterate through the libaries of the appdata
                libs.forEach(function(libname) {
                    // define the attachment path and the local path
                    var localFile = path.join(appData.path, libname);

                    checkDirs(path.dirname(localFile), function() {
                        db.attachment.get(appData.id, libname, function(error, res) {
                            attachmentsToDownload -= 1;

                            if (! error) {
                                fs.writeFileSync(localFile, typeof res == 'object' ? JSON.stringify(res) : res);

                                // mesh.log.info('Updated ' + path.basename(attachment) + ' --> ' + path.basename(localFile));
                                if (attachmentsToDownload <= 0) {
                                    appCallback();
                                } // if
                            }
                            else {
                                mesh.log.error('Unable to download attachment: ' + libname);

                                if (attachmentsToDownload <= 0) {
                                    appCallback();
                                } // if
                            }
                        }, { parseResponse: false });
                    });
                });                
            });
        }
        else if (appCallback) {
            appCallback();
        }
    } // downloadLibrary
    
    db.view('default', 'apps', function(err, res) {
        var apps = [];

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
                    appPath = path.resolve(__dirname, '../apps/' + appid),
                    app;
                    
                // initialise the local app path 
                appData.path = path.resolve(__dirname, '../apps/', appid);
                
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
                
                // add the app to the list of apps
                apps.push(app);
            });

            // if we are the master process, then download applications
            if (downloadApps) {
                async.forEach(res.rows, downloadApp, function() {
                    mesh.log.info('synchronized application resources');
                    finishLoad(null, apps);
                });
            }
            // otherwise, just fire the callback
            else {
                finishLoad(null, apps);
            } // if..else
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

var _loader = module.exports = new CouchAppLoader();
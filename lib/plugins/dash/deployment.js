var async = require('async'),
    debug = require('debug')('steelmesh-dash'),
    fs = require('fs'),
    path = require('path'),
    MeshApp = require('../../app').MeshApp,
    exec = require('child_process').exec,
    zlib = require('zlib'),
    _ = require('underscore'),
	fsutils = require('../../helpers/fsutils'), 
    reValidFile = /(\.tgz|\.tar\.\d+\.gz)$/i,
    rePackageName = /^.*\/(.*?)(\-\d|\.tar|\.\d).*$/i,
    reVersion = /^.*\/(.*?)\-([\d\.\-]+)\..*$/,
    reAppFile = /app\.js/,
    assetsPath = path.resolve(__dirname, '../../../assets/dashboard'),
    packagesPath = path.join(assetsPath, 'package-archive'),
    uploadsPath = path.join(assetsPath, 'uploads'),
    _extractTimeout = 0,
    _watcher;
    
function _extractPackage(archive, itemCallback) {
    var fullPath = path.join(uploadsPath, archive);
    
    debug('attempting to extract package: ' + archive);
    
    _readPackage(fullPath, function() {
        debug('extraction complete for: ' + archive);

        // delete the archive
        fs.unlink(fullPath, function(err) {
            if (! err) {
                debug('archive removed: ' + archive);
            }
            
            itemCallback(err);
        });
    });
} // _extractPackage
    
function _findPackages(callback) {
    var packages = [];
    
    fs.readdir(packagesPath, function(err, files) {
        async.forEach(
            _.without(files || [], 'README.md'),
            function(file, itemCallback) {
                _findVersions(path.join(packagesPath, file), function(versions) {
                    if (versions.length > 0) {
                        packages.push({
                            name: file,
                            versions: versions
                        });
                    }
                    
                    itemCallback();
                });
            }, 
            function() {
                callback(packages);
            }
        );
    });
} // _findPackages

function _findVersions(pkgPath, callback) {
    var versions = [];
    
    fs.readdir(pkgPath, function(err, files) {
        (files || []).forEach(function(file) {
            var lockFile = path.join(pkgPath, file, '.lock');
    
            // if we don't have a lock file, then include in the list of versions
            if (path.existsSync(lockFile)) {
                file += ' (extracting)';
            }
            
            versions.push(file);
        });
        
        callback(versions.sort().reverse());
    });
} // _findVersions
    
function _getPackageFolder(packageFile, callback) {
    var packageName = packageFile.replace(rePackageName, '$1'),
        packageFolder = path.join(packagesPath, packageName), 
        versionMatch = reVersion.exec(packageFile),
        version = versionMatch ? versionMatch[2] : new Date().toISOString(),
        versionFolder = path.join(packageFolder, version);
        
    path.exists(packageFolder, function(exists) {
        if (! exists) {
            fs.mkdirSync(packageFolder);
        }

        // remove the version folder
        // TODO: replace this with a more cross-platform friendly removal
        exec('rm -r ' + versionFolder, function(err) {
            fs.mkdir(versionFolder, function() {
                callback(versionFolder);
            });
        });
    });
}

function _readPackage(packageFile, callback) {
    var callbackTimer = 0, 
        packageFolder, 
        lockFile, 
        lockWritten = false,
        Extract = require('tar').Extract,
        extractor;
        
    function finalizeExtraction() {	
        // remove the lock file
        fs.unlink(lockFile, function(err) {
            callback();
        });
    }
    
    fs.readFile(packageFile, function(err, input) {
        if (err) {
            callback({ errors: ['Could not read package' ]});
            return;
        }
        
        // unzip the file
        zlib.unzip(input, function(err, buffer) {
            if (err) {
                callback(_.extend(data, { errors: ['Could not unzip package '] }));
            }
            else {
                // get the package folder (and create the directories)
                _getPackageFolder(packageFile, function(packageFolder) {
                    lockFile = path.join(packageFolder, '.lock');

                    // create the extractor
                    extractor = new Extract({ path:  packageFolder });

                    extractor.on('entry', function() {
                        clearTimeout(callbackTimer);
                        callbackTimer = setTimeout(finalizeExtraction, 500);
                    });

                    // END handling doesn't seem to be working...
                    extractor.on('end', finalizeExtraction);

                    // create the lock file and then start extracting the archive
                    fs.writeFile(lockFile, 'locked', 'utf8', function(err) {
                        if (err) {
                            callback({ errors: ['Could not create in prep for extracting archive'] });
                        }
                        else {
                            extractor.write(buffer);
                        }
                    });
                });
            }
        });
    });
}
    
function _getDeployData(req, pageName, callback) {
    _findPackages(function(packages) {
        var data = {
            packages: packages
        };

        if (! req.body) {
            callback(data);
            return;
        }

        // get the path to the package file
        var packageFile = req.body.newPackage;

        // ensure that the package file has the correct extension
        if (! reValidFile.test(packageFile)) {
            // req.message('Package must be a tar.gz file', 'error');
            callback(data);
        }
        else {
            path.exists(packageFile, function(exists) {
                if (exists) {
                    _readPackage(packageFile, function(packageData) {
                        // refresh the packages
                        _findPackages(function(newPackages) {
                            callback(_.extend(data, packageData, { packages: newPackages }));
                        });
                    });
                }
                else {
                    callback(data);
                }
            });
        }
    });
} // _getDeployData

function _makePublisher(config, dash) {
    return function(req, res, next) {
        var appid = req.param('appid'),
            version = req.param('version'),
            appPath = path.join(packagesPath, appid, version),
            app;
            
        path.exists(appPath, function(exists) {
			if (exists) {
				debug('path exists - finding app.js');
				fsutils.findFirstIn(appPath, reAppFile, function(err, file, publishPath) {
					if (file) {
						debug('publishing app from ' + publishPath);
						debug('app info: [app: ' + appid + '; version: ' + version + ']');
						app = new MeshApp(publishPath, {
		                    id: appid,
		                    version: version
		                });

		                app.on('load', function() {
		                    dash.log.info('publishing app: ' + app.id + ', version: ' + app.version);

		                    dash.apploader.publish(config, app, function(err) {
		                        if (err) {
		                            dash.log.error('Unable to publish package', err);
		                            res.message('Unable to publish package', 'error');
		                        }
		                        else {
		                            res.message('Published Application: ' + appid + ' (version ' + version + ')', 'success');
		                        }
		                    });
		                });	
					} else {
						res.message('Application could not be published - app.js could not be located'); 
					}
				});
			} else {
                res.message('Requested package version does not exist', 'error');
            }
        });
    };
} // _makePublisher

function _processUploads(event, filename) {
    debug('captured ' + event + ' event in uploads path');
    
    function finishExtraction() {
        _extracting = false;

        // reset the watcher
        if (_watcher) {
            _watcher.close();
        }
        
        debug('monitoring: ' + uploadsPath);
        _watcher = fs.watch(uploadsPath, _processUploads);
        _watcher.on('error', function(err) {
            debug('caught file watch error: ', err);
        });
    } // finishExtraction

    clearTimeout(_extractTimeout);
    _extractTimeout = setTimeout(function() {
        
        fs.readdir(uploadsPath, function(err, files) {
            files = files || [];
            
            if (! err) {
                if (files.length > 0) {
                    debug('extracting uploads');
                }
                
                async.forEach(files, _extractPackage, finishExtraction);
            }
            else {
                finishExtraction();
            }
        });
    }, 500);
}

exports.connect = function(server, config, dash, callback) {
    if (dash.mode === 'primary') {
        fs.mkdir(packagesPath);
        fs.mkdir(uploadsPath);

        _processUploads();

        server.get('/deploy/:appid', _makePublisher(config, dash));

        callback({
            loaders: {
                deploy: _getDeployData
            },

            nav: [
                { url: '/deploy', title: 'Deployment' }
            ]
        });
    }
};

exports.drop = function(server, config) {
    server.remove('/deploy/:appid');
    
    // if we have a watcher, then close it
    if (_watcher) {
        _watcher.close();
        _watcher = null;
    }
    
    return [
        { action: 'dropLoader', loader: 'deploy' },
        { action: 'removeNav', url: '/deploy' }
    ];
};



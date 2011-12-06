var async = require('async'),
    debug = require('debug')('steelmesh-dash'),
    fs = require('fs'),
    mesh = require('mesh'),
    path = require('path'),
    zlib = require('zlib'),
    _ = require('underscore'),
    reValidFile = /(\.tgz|\.tar\.\d+\.gz)$/i,
    rePackageName = /^.*\/(.*?)(\-\d|\.tar|\.\d).*$/i,
    reVersion = /^.*\/(.*?)\-([\d\.\-]+)\..*$/,
    assetsPath = path.resolve(__dirname, '../../../assets/dashboard'),
    packagesPath = path.join(assetsPath, 'package-archive'),
    uploadsPath = path.join(assetsPath, 'uploads');
    
function _findPackages(callback) {
    var packages = [];
    
    fs.readdir(packagesPath, function(err, files) {
        _.without(files || [], 'README.md').forEach(function(file) {
            packages.push({
                name: file,
                versions: fs.readdirSync(path.join(packagesPath, file))
            });
        });
        
        callback(packages);
    });
}
    
function _getPackageFolder(packageFile) {
    var packageName = packageFile.replace(rePackageName, '$1'),
        packageFolder = path.join(packagesPath, packageName), 
        versionMatch = reVersion.exec(packageFile),
        version = versionMatch ? versionMatch[2] : new Date().toISOString(),
        versionFolder = path.join(packageFolder, version);

    // if the package folder does not exist, then create it
    if (! path.existsSync(packageFolder)) {
        fs.mkdirSync(packageFolder);
    }
    
    if (! path.existsSync(versionFolder)) {
        fs.mkdirSync(versionFolder);
    }
    
    return versionFolder;
}

function _readPackage(packageFile, callback) {
    var callbackTimer = 0,
        Extract = require('tar').Extract;
    
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
                // we have an in memory tar... time to process it
                var extractor = new Extract({ path: _getPackageFolder(packageFile) });
                
                extractor.on('entry', function() {
                    clearTimeout(callbackTimer);
                    callbackTimer = setTimeout(callback, 100);
                });

                // END handling doesn't seem to be working...
                extractor.on('end', function() {
                    callback();
                });
                
                extractor.write(buffer);
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
            req.message('Package must be a tar.gz file', 'error');
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
                
                req.url = '/deploy';
            });
        });
    };
} // _makePublisher

exports.connect = function(server, config, dash, callback) {
    fs.mkdir(packagesPath);
    fs.mkdir(uploadsPath);
    
    /*
    fs.readdir(uploadsPath, function(err, files) {
        async.forEach(files, _extractPackage);
    });
    */
    
    server.get('/deploy/:appid', _makePublisher(config));
    
    callback({
        loaders: {
            deploy: _getDeployData
        },
        
        nav: [
            { url: '/deploy', title: 'Deployment' }
        ]
    });
};

exports.drop = function(server, config) {
    server.remove('/deploy/:appid');
    
    return [
        { action: 'dropLoader', loader: 'deploy' },
        { action: 'removeNav', url: '/deploy' }
    ];
};



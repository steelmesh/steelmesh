var async = require('async'),
    cluster = require('cluster'),
    path = require('path'),
    fs = require('fs'),
    events = require('events'),
    util = require('util'),
    configFile = path.resolve('app.json'),
    appConfig = {},
    
    // specify the cleanup paths
    cleanupPaths = [{
        path: path.resolve(__dirname, '../'),
        regex: /\.sock$/i
    }, {
        path: path.resolve(__dirname, '../logs'),
        regex: /\.log$/i
    }];
    
function cleanupTempFiles(mesh, callback) {
    var filesToRemove = [];
    
    // only cleanup logs if we are the master process, otherwise return
    if (! mesh.cluster.isMaster) {
        callback();
        return;
    } // if
    
    async.forEach(
        cleanupPaths,
        function(cleanupData, itemCallback) {
            // find all the sock files in the parent directory
            fs.readdir(cleanupData.path, function(err, files) {
                (files || []).forEach(function(file) {
                    if (cleanupData.regex.test(file)) {
                        filesToRemove.push(path.join(cleanupData.path, file));
                    } // if
                });

                itemCallback(err);
            });
        },
        function(err) {
            async.forEach(filesToRemove, fs.unlink, callback);
        }
    );
} // cleanupTempFiles

function SteelmeshCluster() {
    
} // SteelmeshCluster

util.inherits(SteelmeshCluster, events.EventEmitter);

SteelmeshCluster.prototype.loadConfig = function(mesh, callback) {
    path.exists(configFile, function(exists) {
        if (exists) {
            mesh.out('loading config from: !{underline}{0}', configFile);
            
            fs.readFile(configFile, 'utf8', function(err, data) {
                try {
                    callback(JSON.parse(data));
                }
                catch (e) {
                    mesh.out('!{red}error parsing configuration file: {0}', e.message);
                } // try..catch
            });
        }
        else {
            mesh.out('!{magenta}no configuration file, using default config');
            callback();
        } // if..else
    });
};

SteelmeshCluster.prototype.loadApps = function(mesh, callback) {
    mesh.out('loading apps using the !{underline}{0}!{} apploader', mesh.config.apploader);
    mesh.apploader.loadApps(mesh, function(apps) {
        // update the apps for the steelmesh instance
        mesh.apps = apps || [];

        // fire the callback
        callback(mesh);
    });
}; // syncApps

SteelmeshCluster.prototype.init = function(mesh, callback) {
    var logger;
    
    // create the server
    mesh.cluster = cluster(mesh.createServer())
        .use(cluster.debug())
        .use(cluster.stats())
        .use(cluster.pidfiles('pids'))
        .use(cluster.cli())
        .use(cluster.repl(8888));

    // create the mesh logger
    mesh.out = mesh.cluster.isMaster ? require('out') : function() {};

    cleanupTempFiles(mesh, function() {
        _this.loadConfig(mesh, function(config) {
            // configure the application
            mesh.configure(config);

            // initialise the apploader
            mesh.apploader = require('./apploaders/' + mesh.config.apploader);

            _this.loadApps(mesh, function() {
                // only load jobs if we are the master
                if (mesh.cluster.isMaster) {
                    mesh.apploader.loadJobs(mesh);
                } // if

                // if we have a callback, then trigger it
                if (callback) {
                    callback(mesh);
                } // if
            });
        });
    });
}; // init

var _this = module.exports = new SteelmeshCluster();
var cluster = require('cluster'),
    path = require('path'),
    fs = require('fs'),
    events = require('events'),
    util = require('util'),
    colors = require('colors'),
    configFile = path.resolve('app.json'),
    appConfig = {};

function SteelmeshCluster() {
    
} // SteelmeshCluster

util.inherits(SteelmeshCluster, events.EventEmitter);

SteelmeshCluster.prototype.loadConfig = function(mesh, callback) {
    path.exists(configFile, function(exists) {
        if (exists) {
            mesh.out('loading config from: ' + configFile.underline);
            
            fs.readFile(configFile, 'utf8', function(err, data) {
                try {
                    callback(JSON.parse(data));
                }
                catch (e) {
                    mesh.out(('error parsing configuration file: ' + e.message).red);
                } // try..catch
            });
        }
        else {
            mesh.out('no configuration file, using default config'.magenta);
            callback();
        } // if..else
    });
};

SteelmeshCluster.prototype.loadApps = function(mesh, callback) {
    mesh.out('loading apps using the ' + mesh.config.apploader.underline + ' apploader');
    mesh.apploader.loadApps(mesh, function() {
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
    mesh.out = mesh.cluster.isMaster ? console.log : function() {};
    
    this.loadConfig(mesh, function(config) {
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
        
        if (mesh.apploader.loadResource) {
            mesh.server.use(function(req, res, next) {
                mesh.apploader.loadResource(mesh, req, res, next);
            });
        } // if
    });
}; // init

var _this = module.exports = new SteelmeshCluster();
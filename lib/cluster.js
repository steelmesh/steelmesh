var async = require('async'),
    path = require('path'),
    fs = require('fs'),
    events = require('events'),
    util = require('util'),
    os = require('os'),
    out = require('out'),
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
    callback();
    
    /*
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
    */
} // cleanupTempFiles

function SteelmeshCluster() {
    
} // SteelmeshCluster

util.inherits(SteelmeshCluster, events.EventEmitter);

SteelmeshCluster.prototype.loadConfig = function(mesh, callback) {
    var configFile = path.resolve('config.json');
    
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

SteelmeshCluster.prototype.init = function(mesh, callback) {
    var apploader,
        cluster = mesh.cluster = require('cluster'),
        logger = require('./loggers/' + (cluster.isMaster ? 'master' : 'worker'));

    mesh.out = cluster.isMaster ? require('out') : function() {};

    // redirect the mesh log calls to the logger.writer function
    mesh.log = logger.writer;
    
    cleanupTempFiles(mesh, function() {
        _this.loadConfig(mesh, function(config) {
            // configure the application
            mesh.configure(config);

            // initialise the apploader
            mesh.out('loading apps using the !{underline}{0}!{} apploader', mesh.config.apploader);
            apploader = mesh.apploader = require('./apploaders/' + mesh.config.apploader);

            apploader.loadApps(mesh, function(apps) {
                mesh.apps = apps || [];
                
                // master initialization
                if (cluster.isMaster) {
                    out('Steelmesh master process initialized, forking {0} workers', os.cpus().length);
                    for (var ii = os.cpus().length; ii--; ) {
                        var worker = cluster.fork();
                        
                        worker.send({
                            cmd: 'update-env',
                            key: 'STEELMESH_REQUESTLOG',
                            value: path.resolve(__dirname, '../logs/worker-' + ii + '-requests.log')
                        });
                        
                        // attach the worker to the logger
                        logger.attachWorker(worker);
                    }

                    cluster.on('death', function(worker) {
                        out('worker {0} died', worker.pid);
                    });
                }
                // otherwise this is a worker process, so we will create the server
                else {
                    // console.log(process.env);
                    mesh.createServer().listen(3001);
                }                

                // if we have a callback, then trigger it
                if (callback) {
                    callback(mesh);
                } // if
            });
        });
    });
}; // init

var _this = module.exports = new SteelmeshCluster();
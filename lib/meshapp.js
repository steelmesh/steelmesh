var fs = require('fs'),
    path = require('path'),
    events = require('events'),
    util = require('util');

var MeshApp = exports.MeshApp = function(appPath, config) {
    this.basePath = appPath;
    
    this.routes = config.routes || [];
    this.jobs = config.jobs || [];
};

util.inherits(MeshApp, events.EventEmitter);

MeshApp.prototype.loadResource = function(resource, callback) {
    var targetFile = path.resolve(this.basePath, path.join('resources', resource));
    
    fs.readFile(targetFile, 'utf8', function(err, data) {
        callback(err, data, {
            path: targetFile
        });
    });
};
var fs = require('fs'),
    path = require('path'),
    _ = require('underscore'),
    packageFile = path.resolve(__dirname, '../../../package.json');

// version controller
exports.connect = function(server, mesh) {
    var steelmeshVersion;

    // read the package file
    fs.readFile(packageFile, 'utf8', function(err, data) {
        if (! err) {
            steelmeshVersion = JSON.parse(data).version;
        }
    });
    
    // find the steelmesh version number
    server.get('/version', function(req, res, next) {
        res.json({
            steelmesh: steelmeshVersion,
            node: _.map(process.versions, function(value, key) {
                return { system: key, version: value };
            })
        });
    });
};
var _ = require('underscore');

// version controller
exports.connect = function(server, mesh) {
    // find the steelmesh version number
    server.get('/version', function(req, res, next) {
        res.json(process.versions);
    });
};
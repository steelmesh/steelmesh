var _errorResponse = { error: 'no jobs' };

// health controller
exports.connect = function(server, mesh) {
    server.get('/jobs', function(req, res, next) {
        if (mesh.monitorBridge) {
            mesh.monitorBridge.request('jobs', function(err, jobs) {
                if (! err) {
                    res.json(jobs);
                }
                else {
                    res.json(_errorResponse);
                }
            });
        }
        else {
            res.json(_errorResponse);
        }
    });
};
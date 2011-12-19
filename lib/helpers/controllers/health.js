var _statusUnknown = { server: 'unknown' };

// health controller
exports.connect = function(server, mesh) {
    server.get('/up', function(req, res, next) {
        if (mesh.monitorBridge) {
            mesh.monitorBridge.request('status', function(err, status) {
                if (! err) {
                    res.json({ server: status && status.available ? 'up' : 'down' });
                }
                else {
                    res.json(_statusUnknown);
                }
            });
        }
        else {
            res.json(_statusUnknown);
        }
    });
};
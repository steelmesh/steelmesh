exports.connect = function(server, config, dash, callback) {
    server.get('/status', function(req, res) {
        res.json({ status: dash.status });
    });
    
    callback();
};

exports.drop = function(server, config) {
    server.remove('/status');
};
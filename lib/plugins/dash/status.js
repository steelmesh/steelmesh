var _status = '';

exports.connect = function(server, config, dash, callback) {
    dash.messenger.on('status', function(status) {
        _status = status;
    });
    
    server.get('/status', function(req, res) {
        res.json({ status: _status });
    });
    
    callback();
};

exports.drop = function(server, config) {
    server.remove('/status');
};
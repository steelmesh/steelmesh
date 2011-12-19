var debug = require('debug')('steelmesh-dash');

function _getHealthData(dash) {
    return function(req, page, callback) {
        if (dash.monitorBridge) {
            dash.monitorBridge.request('status', function(err, statusData) {
                callback(statusData);
            });
        }
    };
} // _getHealthData

exports.connect = function(server, config, dash, callback) {
    callback({
        loaders: {
            index: _getHealthData(dash)
        }
    });
};

exports.drop = function(server, config) {
    return [
        { action: 'dropLoader', loader: 'index' }
    ];
};
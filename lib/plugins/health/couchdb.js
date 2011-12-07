var nano = require('nano');

function _couchChecker(config) {
    var couch = nano(config.couchurl);
    
    return function(callback) {
        couch.db.get(config.meshdb, function(err, doc) {
            callback({ available: !err && !doc.error, subsystem: 'steelmesh database' });
        });
    };
}

exports.connect = function(config, callback) {
    callback({
        check: _couchChecker(config)
    });
};
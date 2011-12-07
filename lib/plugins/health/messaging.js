var debug = require('debug')('steelmesh-mon'),
    messaging = require('../../helpers/messaging');

function _checkMessaging(callback) {
    messaging.create(function(messenger) {
        callback({ available: typeof messenger != 'undefined' });
        
        if (messenger) {
            messenger.quit();
        }
    });
}

exports.connect = function(config, callback) {
    callback({
        check: _checkMessaging
    });
};

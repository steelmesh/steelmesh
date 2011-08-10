var request = require('request'),
    reStatusOK = /^(2|3)\d{2}$/;

exports.title = 'CouchDB';
exports.check = function(stack, callback) {
    var targetUrl = stack.config.couchurl + '/_stats';
    
    // get the location of the couch db implementation
    request({ uri: targetUrl }, function(err, response, body) {
        var validResponse = (! err) && reStatusOK.test(response.statusCode);
        
        if (! validResponse) {
            callback(false, err);
        }
        else {
            callback(true, 'OK');
        } // if..else
    });
};
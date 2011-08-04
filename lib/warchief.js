var request = require('request'),
    reStatusOK = /^(2|3)\d{2}$/;

module.exports = (function() {
    
    /* internals */
    
    var parent;
    
    function clientConnect(stack, callback, queryParams, req, res, next) {
        callback({
            master: parent
        });
    } // clientConnect
    
    /* exports */
    
    function router(app, stack) {
        app.get('/sync', stack.wrap(clientConnect));
    } // router
    
    function sync(stack, target, callback) {
        var targetUrl = 'http://' + target + '/_stack/';
        
        request({
            method: 'GET',
            uri: targetUrl + 'sync'
        }, function(err, response, body) {
            var validResponse = (! err) && reStatusOK.test(response.statusCode);
            
            if (validResponse) {
                parent = targetUrl;
                
                if (callback) {
                    callback(body);
                } // if
            } // if
        });    
    } // sync
    
    return {
        router: router,
        sync: sync
    };
})();
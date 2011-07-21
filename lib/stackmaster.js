var request = require('request');

module.exports = (function() {
    
    /* internals */
    
    var isMaster = false,
        parent;
    
    function clientConnect(stack, callback, queryParams, req, res, next) {
    } // clientConnect
    
    function redirect(stack, callback, queryParams, req, res, next) {
        if (parent) {
            res.redirect(parent + 'connect');
        }
        else {
            callback({
                master: 'none'
            });
        } // if..else
    } // redirect
    
    /* exports */
    
    function connect(target, callback) {
        var targetUrl = 'http://' + parent + '/_stack/';
        
        request({
            method: 'GET',
            uri: targetUrl + 'connect',
            headers: {
                'Content-Type': 'text/json'
            }
        }, function(err, response, body) {
            if (! err) {
                parent = targetUrl;
            } // if
            
            callback(err ? 'standalone' : 'slave');
        });    
    } // connect
    
    function init(stack, callback) {
        isMaster = true;
        
        if (callback) {
            callback();
        } // if
    } // init
    
    function router(app, stack) {
        app.get('/connect', stack.wrap(isMaster ? clientConnect : redirect));
    } // router
    
    return {
        connect: connect,
        init: init,
        router: router
    };
})();
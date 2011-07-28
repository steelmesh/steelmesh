var request = require('request'),
    reStatusOK = /^(2|3)\d{2}$/;

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
    
    function connect(stack, target, callback) {
        var targetUrl = 'http://' + target + '/_stack/';
        
        request({
            method: 'GET',
            uri: targetUrl + 'connect',
            headers: {
                'Content-Type': 'text/json'
            }
        }, function(err, response, body) {
            var validResponse = (! err) && reStatusOK.test(response.statusCode);
            
            if (validResponse) {
                parent = targetUrl;
            }
            else {
                stack.log('Unable to contact master nodeSTACK: ' + 
                    (err || ('Status: ' + response.statusCode))
                );
            } // if..else
            
            callback(validResponse ? 'slave' : 'standalone');
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
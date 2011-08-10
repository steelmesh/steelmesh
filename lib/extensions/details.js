var fs = require('fs'),
    path = require('path');

function details(stack, callback, queryParams, req, res, next) { 
    var dsName = (req.params.dataset || '').replace(':', '_'),
        itemId = dsName + '::' + req.params.id;

    if (stack.couch) {
        stack.couch.getDoc({ id: itemId }, function(res) {
            if (res.error) {
                callback({
                    error: 'Could not locate item'
                });
            }
            else {
                callback(res);
            } // if..else
        });
    }
    else {
        callback({
            error: 'CouchDB not initialized, cannot retrieve file'
        });
    } // if..else
} // details

exports.router = function(app, stack) {
    app.get('/public/details?/:dataset/:id', stack.wrap(details));
};
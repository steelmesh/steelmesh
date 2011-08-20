var fs = require('fs'),
    path = require('path');
    
function couchAvailable(stack, callback) {
    var available = stack.couch;
    
    if (! available) {
        callback({
            error: 'CouchDB not initialized, cannot retrieve file'
        });
    } // if
    
    return available;
} // couchAvailable

function getItemId(stack, req) {
    var dsName = (req.params.dataset || '').replace(':', '_');
    
    return itemId = dsName + '::' + req.params.id;
} // getItemId

function details(stack, callback, queryParams, req, res, next) { 
    var itemId = getItemId(stack, req);
    if (couchAvailable(stack, callback)) {
        stack.couch.get({ _id: itemId }, function(error, res) {
            if (error) {
                callback({
                    error: 'Could not locate item'
                });
            }
            else {
                callback(res);
            } // if..else
        });
    } // if
} // details

function showDetails(stack, callback, queryParams, req, res, next) {
    var dsName = (req.params.dataset || '').replace(':', '_'),
        itemId = getItemId(stack, req);
        
    if (couchAvailable(stack, callback)) {
        stack.couch.show(stack, itemId, req.params.fn, function(res) {
            if (res.error) {
                callback({
                    error: 'Could not display item with requested view'
                });
            }
            else {
                callback(res);
            } // if..else
        });
    } // if
} // showDetails

exports.router = function(app, stack) {
    app.get(
        '/details?/:dataset/:id', 
        stack.wrap(details)
    );
    
    app.get(
        '/details?/:dataset/:id/:fn', 
        stack.wrap(showDetails)
    );
};
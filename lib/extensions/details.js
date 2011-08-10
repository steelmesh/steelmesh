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

function couchShow(stack, dsName, itemId, fn, callback) {
    stack.couch.queryDesign({ 
        design: dsName,
        id: itemId,
        show: fn
     }, callback);
} // couchShow
    
function getItemId(stack, req) {
    var dsName = (req.params.dataset || '').replace(':', '_');
    
    return itemId = dsName + '::' + req.params.id;
} // getItemId

function details(stack, callback, queryParams, req, res, next) { 
    var itemId = getItemId(stack, req);
    if (couchAvailable(stack, callback)) {
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
    } // if
} // details

function showDetails(stack, callback, queryParams, req, res, next) {
    var dsName = (req.params.dataset || '').replace(':', '_'),
        itemId = getItemId(stack, req);
        
    if (couchAvailable(stack, callback)) {
        // attempt to invoke the show function using the specified dataset
        couchShow(stack, dsName, itemId, req.params.fn, function(res) {
            if (res.error) {
                couchShow(stack, 'default', itemId, req.params.fn, function(res) {
                    if (res.error) {
                        callback({
                            error: 'Could not display item with requested view'
                        });
                    }
                    else {
                        callback(res);
                    } // if..else
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
        '/public/details?/:dataset/:id', 
        stack.wrap(details)
    );
    
    app.get(
        '/public/details?/:dataset/:id/:fn', 
        stack.wrap(showDetails)
    );
};
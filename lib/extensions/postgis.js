/*
# PostGIS 
The PostGIS extension is provide a geospatial layer on top of the underlying
CouchDB datastore.  While some of this functionality can be provided through 
the use of [GeoCouch](http://blog.couchbase.com/tag/geocouch) some more 
advanced GIS operations require the use of PostGIS.
*/

var fs = require('fs'),
    path = require('path'),
    reIgnoreItem = /^_design.*/i,
    reInvalidDataset = /^(\.|geostack).*$/;

function datasetSearch(geostack, callback, queryParams, req, res, next) {
    // require the dataset
    var dataset = require(process.cwd() + '/lib/datasets/' + req.params.dataset),
        dsConfig = extendConfig(dataset.config),
        processor = require('./geo/' + dataset.type).init(dsConfig)[req.params.op];
        
    if (processor) {
        processor(geostack, callback, queryParams, req, res);
    }
    else {
        throw new Error('Dataset does not support the \'' + req.params.op + '\' operation');
    } // if..else
} // datasetSearch

function updateItemSnapshot(stack, item) {
    stack.couch.show(stack, item.id, 'summary', function(res) {
        if (! res.error) {
            console.log(res);
        } // if
    });
} // updateItemSnapshot

exports.init = function(stack) {
    stack.requireConnector('postgres');
    
    // handle new items being created
    stack.on('itemUpdate', function(item) {
        if (item && item.id && stack.couch && (! reIgnoreItem.test(item.id))) {
            updateItemSnapshot(stack, item);
        } // if
    });
}; // init

exports.router = function(app, stack) {
    app.get('/public/pois/:dataset/:op', stack.wrap(datasetSearch));
};
/*
# PostGIS 
The PostGIS extension is provide a geospatial layer on top of the underlying
CouchDB datastore.  While some of this functionality can be provided through 
the use of [GeoCouch](http://blog.couchbase.com/tag/geocouch) some more 
advanced GIS operations require the use of PostGIS.
*/

var async = require('async'), 
    fs = require('fs'),
    path = require('path'),
    reIgnoreItem = /^_design.*/i,
    reInvalidDataset = /^(\.|geostack).*$/;
    
function checkSchema(stack, typeName, design) {
    
    function applySchema(version, callback) {
        stack.couch.get('_design/' + typeName + '/init-v' + version + '.sql', function(error, res) {
            if (! error) {
                console.log('executing query:', res);

                stack.postgres.query(res, function(qryErr, result) {
                    callback(qryErr ? qryErr : null);
                });
            }
            else {
                console.log('error retrieving: ', error);
                callback();
            } // if..else
        });
    } // applySchema
    
    if (design.schema) {
        stack.log('have a schema for type: ' + typeName + ', validating.');

        var requiredVersion = parseInt(design.schema.version, 10) || 1,
            currentVersion,
            versionSteps = [];
            
        stack.settingRead('schema_version', typeName, function(value) {
            currentVersion = parseInt(value, 10) || 0;
            
            if (currentVersion !== requiredVersion) {
                // create the list of version steps that are required to get us to the 
                // required version
                while (++currentVersion <= requiredVersion) {
                    versionSteps.push(currentVersion);
                } // while
                
                console.log(versionSteps);
                async.forEachSeries(versionSteps, applySchema, function() {
                    stack.settingWrite('schema_version', typeName, requiredVersion);
                });
            } // if
        });
    } // if
    
} // checkSchema

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
    stack.couch.show(stack, item.id, 'summary', function(error, res) {
        if (! error) {
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
    
    stack.on('validateDesign', function(typeName, design) {
        checkSchema(stack, typeName, design);
    });
}; // init

exports.router = function(app, stack) {
    app.get('/public/pois/:dataset/:op', stack.wrap(datasetSearch));
};
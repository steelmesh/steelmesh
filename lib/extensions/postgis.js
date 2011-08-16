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
    reInvalidDataset = /^(\.|geostack).*$/,
    reIgnoreFields = /^type$/i,
    reSingleQuote = /\'/g,
    fieldSpecs = {};
    
function checkSchema(stack, typeName, design) {
    
    function applySchema(version, callback) {
        stack.couch.get('_design/' + typeName + '/init-v' + version + '.sql', function(error, res) {
            if (! error) {
                console.log('executing query:', res);

                stack.postgres.query(res, function(qryErr, result) {
                    if (qryErr) {
                        console.log(qryErr);
                    } // if
                    
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
                async.forEachSeries(versionSteps, applySchema, function(error) {
                    if (! error) {
                        stack.settingWrite('schema_version', typeName, requiredVersion);
                    } // if
                });
            } // if
        });
    } // if
    
} // checkSchema

function createPointGeometry(stack, res, saveFn) {
    var pos = res.pos || {},
        lon = pos.lon || 0,
        lat = pos.lat || 0,
        sql = 'SELECT ST_SetSRID(ST_MakePoint(' + lon + ', ' + lat + '), 4326) AS the_geom;';
        
    stack.postgres.query(sql, function(qryErr, result) {
        if (! qryErr && (result.rowCount > 0)) {
            // add the geom information to the result
            res.the_geom = result.rows[0].the_geom;

            // call the save function
            if (saveFn) {
                saveFn(stack, res);
            } // if
        } // if
    });
} // createPointGeometry

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

function findFieldSpecs(stack, res, callback) {
    var specsSQL = 'SELECT column_name, data_type FROM information_schema.columns WHERE table_name = \'' + res.type + '\';';
    
    // run the delete statement
    stack.postgres.query(specsSQL, function(qryErr, result) {
        // save the field spec whether successful or not (to prevent recursion)
        fieldSpecs[res.type] = result.rows || [];
        console.log(fieldSpecs);
        
        // fire the callback
        callback();
    });
} // findFieldSpecs

function makeInsertSQL(stack, res) {
    var fields = [], fieldValues = [];
        
    // determine the fields that will be included
    for (var key in res) {
        if (! reIgnoreFields.test(key)) {
            var fieldVal = res[key];
            
            switch (typeof fieldVal) {
                case 'string': {
                    fields.push(key);
                    fieldValues.push('\'' + fieldVal.replace(reSingleQuote, '\\\'') + '\'');
                    break;
                }
                
                case 'number': {
                    fields.push(key);
                    fieldValues.push(fieldVal);
                    break;
                }
            } // switch
        } // if
    } // for

    // add the field specifiers
    return 'INSERT INTO ' + res.type + '(' + fields.join(',') + ') ' + 
           'VALUES (' + fieldValues.join(',') + ')';
} // makeInsertSQL

function saveItem(stack, res, callback) {
    var deleteSQL = 'DELETE FROM ' + res.type + ' WHERE id = \'' + res.id + '\'',
        insertSQL = makeInsertSQL(stack, res);

    // run the delete statement
    stack.postgres.query(deleteSQL, function(errDelete) {
        // if no error has occurred, then run the insert
        if (! errDelete) {
            stack.postgres.query(insertSQL, function(errInsert) {
                if (! errInsert) {
                    stack.log('inserted ' + res.type + '::' + res.id + ' into local postgis store');
                } 
                else {
                    stack.log('error inserting ' + res.type + '::' + res.id + ' into local postgis store', 'WARNING');
                } // if..else
            });
        } // if
    });
} // saveItem

function updateItemSnapshot(stack, item) {
    stack.couch.show(stack, item.id, 'summary', function(error, res) {
        if (! error) {
            if (res.pos) {
                createPointGeometry(stack, res, saveItem);
            } // if
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
var async = require('async'),
    request = require('request'),
    fs = require('fs'),
    path = require('path'),
    url = require('url'),
    reStatusOK = /^(2|3)\d{2}$/,
    reValidCouchApp = /^[A-Za-z].*/,
    reNoDB = /no_db.*/i;
    
module.exports = (function() {
    
    /* internals */
    
    var couch = null,
        datasetsQuery = '_design/default/_view/datasets?group=true';
    
    function dbReset(mesh, callback) {
        mesh.log('CouchDB reset detected, resetting lastChangeId setting');
        mesh.settingWrite('couch', 'lastChangeId', 0);

        if (callback) {
            callback();
        } // if
    } // dbReset

    function findDatasets(mesh, callback, queryParams, req, res, next) {
        if (! couch) {
            callback({
                datasets: []
            });
        }
        else {
            couch.get(datasetsQuery, function(error, res) {
                if (error) {
                    callback({
                        datasets: []
                    });
                }
                else {
                    callback({
                        datasets: res.rows
                    });
                } // if..else
            });
        } // if..else
    } // datasets

    function queryTypeDesign(mesh, itemType, query, callback) {
        // initialise defaults
        query = query || {};
        query.design = itemType;
        
        couch.queryDesign(query, function(error, res) {
            if (error && query.design !== 'default') {
                query.design = 'default';
                couch.queryDesign(query, function(res) {
                    if (callback) {
                        callback(res);
                    } // if
                });
            }
            else if (callback) {
                callback(res);
            } // if..else
        });
    } // queryTypeDesign

    function runStartupChecks(mesh, callback) {
        // check that they database has been created
        couch.get(function(error, res) {
            console.log(res);
            
            if (error) {
                couch.put(function(error, res) {
                    if (! error) {
                        runStartupChecks(mesh, callback);
                    }
                    else {
                        callback(res);
                    } // if..else
                });
            }
            else {
                // write the instance start time
                mesh.settingRead('couch', 'instance_start_time', function(instanceStartTime) {
                    if (instanceStartTime === res.instance_start_time) {
                        mesh.settingRead('couch', 'lastChangeId', function(lastChangeId) {
                            if (lastChangeId > res.update_seq) {
                                dbReset(mesh, callback);
                            }
                            else {
                                mesh.inSync = lastChangeId === res.update_seq;
                                callback();
                            } // if..else
                        });
                    }
                    else {
                        mesh.settingWrite('couch', 'instance_start_time', res.instance_start_time);
                        dbReset(mesh, callback);
                    } // if..else
                });
            } // if..else
        });
    } // runStartupChecks
    
    /* exports */
    
    function check(mesh, callback) {
        if (! couch) {
            callback(false, 'No connection to CouchDB');
        }
        else {
            couch.exists(function(exists) {
                callback(exists);
            });
        } // if..else
    } // check
    
    function checkDatasets(mesh, callback) {
        
        function checkDS(ds, callback) {
            couch.get('_design/' + ds, function(error, res) {
                if (! error ) {
                    mesh.validateDesign(ds, res, callback);
                }
                else {
                    callback();
                } // if..else
            });
        } // validateDataset
        
        couch.get(datasetsQuery, function(error, res) {
            var dsNames = [];
            
            // if the query was successful, then check that each is dataset is valid
            if (res.rows) {
                // find datasets not represented in the apps
                for (var ii = 0; res.rows && ii < res.rows.length; ii++) {
                    if (dsNames.indexOf(res.rows[ii].key) < 0) {
                        dsNames.push(res.rows[ii].key);
                    } // if
                } // for
                
                async.forEach(dsNames, checkDS, function(err, results) {
                    console.log('checked');
                    callback();
                });
            }
            else {
                callback(error, res);
            } // if..else
        });
    } // checkDatasets
    
    function init(mesh) {
        couch = require('comfy').init({
            url: mesh.config.couchurl,
            db: mesh.config.datadb
        });

        // update the mesh couch reference
        mesh.couch = _module;
        
        // copy methods from the couch object
        for (var key in couch) {
            if (couch.hasOwnProperty(key) && (! _module[key])) {
                mesh.couch[key] = couch[key];
            } // if
        } // if
        
        // if we are in the master process, then run a few sanity checks
        if (mesh.masterProcess) {
            // run the checks
            runStartupChecks(mesh, function() {
                // check for an active connection
                couch.get(function(error, res) {
                    if (! error) {
                        // check the datatypes
                        checkDatasets(mesh, function(error) {
                            // emit the couch ok event
                            mesh.emit('couchOK');
                        });
                    }
                    else {
                        mesh.log('No connection to CouchDB', 'WARNING');
                    } // if..else
                });
            });
        }
        else {
            // check for an active connection
            couch.get(function(error, res) {
                if (error) {
                    mesh.log('No connection to CouchDB', 'WARNING');
                }
                else {
                    // emit the couch ok event
                    mesh.emit('couchOK');
                } // if..else
            });
        } // if..else
    } // init
    
    function show(mesh, id, fnName, callback) {
        // split the id
        var idParts = id.split('::'),
            itemType = idParts.length > 1 ? idParts[0] : '',
            urls = ['_design/default/_show/' + fnName + '/' + id];
            
        if (itemType) {
            urls.unshift('_design/' + itemType + '/_show/' + fnName + '/' + id);
        } // if
        
        couch.getFirst(urls, callback);
    } // show

    function router(app, mesh) {
        // add some dashboard reporting
        app.get('/dash/datasets', mesh.wrap(findDatasets));
    } // router
    
    var _module = {
        title: 'CouchDB',
        
        check: check,
        checkDatasets: checkDatasets,
        init: init,
        show: show,
        router: router
    };
    
    return _module;
})();
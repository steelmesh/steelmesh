var async = require('async'),
    request = require('request'),
    fs = require('fs'),
    path = require('path'),
    couchapp = require('couchapp'),
    url = require('url'),
    reStatusOK = /^(2|3)\d{2}$/,
    reValidCouchApp = /^[A-Za-z].*/,
    reNoDB = /no_db.*/i;
    
module.exports = (function() {
    
    /* internals */
    
    var couch = null,
        datasetsQuery = {
            design: 'default',
            view: 'datasets',
            args: {
                group: true
            }
        };
    
    function dbReset(stack, callback) {
        stack.log('CouchDB reset detected, resetting lastChangeId setting');
        stack.settingWrite('couch', 'lastChangeId', 0);

        if (callback) {
            callback();
        } // if
    } // dbReset

    function findCouchApps(stack, callback) {
        var couchUrl = url.format({
                protocol: stack.config.couchdb_proto,
                hostname: stack.config.couchdb_host,
                port: stack.config.couchdb_port,
                pathname: '/' + stack.config.couchdb_name
            }),
            appsToLoad = [];

        fs.readdir('lib/couchapps', function(err, files) {
            if (err) {
                console.log(err);
                return;
            } // if

            // iterate through the files and load the designs into couch
            for (var ii = 0; ii < files.length; ii++) {
                if (reValidCouchApp.test(files[ii])) {
                    appsToLoad.push(path.basename(files[ii], '.js'));
                } // if
            } // for
            
            // load each of the required apps
            async.forEach(
                appsToLoad, 
                function(design, callback) {
                    loadCouchApp(stack, couchUrl, design, callback);
                }, 
                function() {
                    if (callback) {
                        callback(appsToLoad);
                    } // if
                }
            );
        });
    } // findCouchApps

    function findDatasets(stack, callback, queryParams, req, res, next) {
        if (! stack.couch) {
            callback({
                datasets: []
            });
        }
        else {
            stack.couch.queryDesign(datasetsQuery, function(res) {
                if (res.error) {
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

    function loadCouchApp(stack, couchUrl, design, callback) {
        // include the design doc and set it's id based on the filename
        var doc = require('../couchapps/' + design),
            attachmentsDir = path.join(__dirname, '../couchapps', '_' + design);
            
        
        path.exists(attachmentsDir, function(exists) {
            doc._id = '_design/' + design;

            // load any attachments for the design
            if (exists) {
                couchapp.loadAttachments(doc, attachmentsDir);
            } // if

            // deploy the application
            stack.log('publishing couch app: ' + design);
            couchapp.createApp(doc, couchUrl, function(app) {
                app.push(callback);
            });
        });
    } // loadCouchApp
    
    function queryTypeDesign(stack, itemType, query, callback) {
        // initialise defaults
        query = query || {};
        query.design = itemType;
        
        couch.queryDesign(query, function(res) {
            if (res.error && query.design !== 'default') {
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

    function runStartupChecks(stack, callback) {
        var dbName = stack.config.couchdb_name;

        // check that they database has been created
        couch.queryDB({ db: dbName }, function(res) {
            if (res.error && reNoDB.test(res.reason)) {
                couch.createDB({ db: dbName}, function(res) {
                    if (! res.error) {
                        runStartupChecks(stack, couch, callback);
                    }
                    else {
                        callback(res);
                    } // if..else
                });
            } // if

            if (! res.error) {
                // write the instance start time
                stack.settingRead('couch', 'instance_start_time', function(instanceStartTime) {
                    if (instanceStartTime === res.instance_start_time) {
                        stack.settingRead('couch', 'lastChangeId', function(lastChangeId) {
                            if (lastChangeId > res.update_seq) {
                                dbReset(stack, callback);
                            }
                            else {
                                stack.inSync = lastChangeId === res.update_seq;
                                callback();
                            } // if..else
                        });
                    }
                    else {
                        stack.settingWrite('couch', 'instance_start_time', res.instance_start_time);
                        dbReset(stack, callback);
                    } // if..else
                });
            } // if
        });

        // if our last change id is greater than the update seq for the database,
        // reset our value


    } // runStartupChecks
    
    /* exports */
    
    function check(stack, callback) {
        if (! stack.couch) {
            callback(false, 'No connection to CouchDB');
        }
        else {
            stack.couch.queryDB({ db: stack.config.couchdb_name }, function(res) {
                callback(! res.error, res.error);
            });
        } // if..else
    } // check
    
    function checkDatasets(stack, apps, callback) {
        
        function checkDS(ds, callback) {
            queryTypeDesign(stack, ds, {}, function(res) {
                if (! res.error ) {
                    stack.validateDesign(ds, res);
                } // if 
            });
        } // validateDataset
        
        couch.queryDesign(datasetsQuery, function(res) {
            var dsNames = apps || [];
            
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
                callback(res);
            } // if..else
        });
    } // checkDatasets    
    
    function init(stack) {
        couch = require('PJsonCouch')({
            protocol: stack.config.couchdb_proto || 'http',
            host: stack.config.couchdb_host || 'localhost',
            port: stack.config.couchdb_port || 5984
        });

        // update the stack couch reference
        stack.couch = _module;
        
        // copy methods from the couch object
        for (var key in couch) {
            if (couch.hasOwnProperty(key) && (! _module[key])) {
                stack.couch[key] = couch[key];
            } // if
        } // if
        
        // set the default database
        couch.setDB({ db: stack.config.couchdb_name });

        // if we are in the master process, then run a few sanity checks
        if (stack.masterProcess) {
            // run the checks
            runStartupChecks(stack, function() {
                // check for an active connection
                couch.queryDB({}, function(res) {
                    if (! res.error) {
                        findCouchApps(stack, function(apps) {
                            // check the datatypes
                            checkDatasets(stack, apps, function() {
                                // emit the couch ok event
                                stack.emit('couchOK');
                            });
                        });
                    }
                    else {
                        stack.log('No connection to CouchDB', 'WARNING');
                    } // if..else
                });
            });
        }
        else {
            // check for an active connection
            couch.queryDB({}, function(res) {
                if (res.error) {
                    stack.log('No connection to CouchDB', 'WARNING');
                }
                else {
                    // emit the couch ok event
                    stack.emit('couchOK');
                } // if..else
            });
        } // if..else
    } // init
    
    function show(stack, id, fnName, callback) {
        // split the id
        var idParts = id.split('::'),
            itemType = idParts.length > 1 ? idParts[0] : 'default',
            query = {
                id: id,
                show: fnName
            };
            
        queryTypeDesign(stack, itemType, query, function(res) {
            if (callback) {
                callback(res);
            } // if
        });
    } // show

    function router(app, stack) {
        // add some dashboard reporting
        app.get('/dash/datasets', stack.wrap(findDatasets));
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





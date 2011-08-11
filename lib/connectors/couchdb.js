var request = require('request'),
    fs = require('fs'),
    path = require('path'),
    couchapp = require('couchapp'),
    url = require('url'),
    reStatusOK = /^(2|3)\d{2}$/,
    reNoDB = /no_db.*/i;

exports.title = 'CouchDB';
exports.connection = null;

function dbReset(stack, callback) {
    stack.log('CouchDB reset detected, resetting lastChangeId setting');
    stack.settingWrite('couch', 'lastChangeId', 0);
    
    if (callback) {
        callback();
    } // if
} // dbReset

function findCouchApps(stack, couch) {
    var couchUrl = url.format({
        protocol: stack.config.couchdb_proto,
        hostname: stack.config.couchdb_host,
        port: stack.config.couchdb_port,
        pathname: '/' + stack.config.couchdb_name
    });
    
    fs.readdir('lib/couchapps', function(err, files) {
        if (err) {
            console.log(err);
            return;
        } // if

        // iterate through the files and load the designs into couch
        for (var ii = 0; ii < files.length; ii++) {
            loadCouchApp(stack, couch, couchUrl, path.basename(files[ii], '.js'));
        } // for
    });
} // findCouchApps

function findDatasets(stack, callback, queryParams, req, res, next) {
    if (! stack.couch) {
        callback({
            datasets: []
        });
    }
    else {
        stack.couch.queryDesign({
            design: 'default',
            view: 'datasets',
            args: { group: true }
        }, function(res) {
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

function loadCouchApp(stack, couch, couchUrl, design, callback) {
    // include the design doc and set it's id based on the filename
    var doc = require('../couchapps/' + design);
    doc._id = '_design/' + design;
    
    // deploy the application
    stack.log('publishing couch app: ' + design);
    couchapp.createApp(doc, couchUrl, function(app) {
        app.push();
    });
} // loadCouchApp

function runStartupChecks(stack, couch, callback) {
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

exports.check = function(stack, callback) {
    if (! stack.couch) {
        callback(false, 'No connection to CouchDB');
    }
    else {
        stack.couch.queryDB({ db: stack.config.couchdb_name }, function(res) {
            var ok = !res.error;
            
            if (res.error) {
                callback(false, res.error);
            }
            else if (stack.inSync) {
                callback(true);
            }
            else {
                stack.settingRead('couch', 'lastChangeId', function(lastChangeId) {
                    stack.inSync = lastChangeId === res.update_seq;
                    callback(stack.inSync);
                }, true);
            } // if..else
        });
    } // if..else
};

exports.init = function(stack) {
    var couch = exports.connection = require('PJsonCouch')({
        protocol: stack.config.couchdb_proto || 'http',
        host: stack.config.couchdb_host || 'localhost',
        port: stack.config.couchdb_port || 5984
    });
    
    if (stack.masterProcess) {
        // run the checks
        runStartupChecks(stack, couch, function() {
            // check for an active connection
            couch.queryDB({ db: stack.config.couchdb_name }, function(res) {
                if (! res.error) {
                    findCouchApps(stack, couch);
                }
                else {
                    stack.log('No connection to CouchDB', 'WARN');
                } // if..else
            });
        });
    } // if
};

exports.router = function(app, stack) {
    // add some dashboard reporting
    app.get('/dash/datasets', stack.wrap(findDatasets));
};
var request = require('request'),
    fs = require('fs'),
    path = require('path'),
    couchapp = require('couchapp'),
    url = require('url'),
    reStatusOK = /^(2|3)\d{2}$/;

exports.title = 'CouchDB';
exports.connection = null;

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
    couchapp.createApp(doc, couchUrl, function(app) {
        app.push();
    });
} // loadCouchApp

exports.check = function(stack, callback) {
    if (! stack.couch) {
        callback(false, 'No connection to CouchDB');
    }
    else {
        stack.couch.queryDB({ db: stack.config.couchdb_name }, function(res) {
            callback(! res.error, res.error);
        });
        
        // TODO: check that we are up to date with the latest revisions in the table
    } // if..else
};

exports.init = function(stack) {
    var couch = exports.connection = require('PJsonCouch')({
        protocol: stack.config.couchdb_proto || 'http',
        host: stack.config.couchdb_host || 'localhost',
        port: stack.config.couchdb_port || 5984
    });
    
    if (stack.masterProcess) {
        findCouchApps(stack, couch);
    } // if
};

exports.router = function(app, stack) {
    // add some dashboard reporting
    app.get('/dash/datasets', stack.wrap(findDatasets));
};
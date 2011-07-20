var fs = require('fs'),
    path = require('path'),
    pg = require('pg'),
    conString = "tcp://postgres:1234@localhost/geostack",
    reInvalidDataset = /^(\.|geostack).*$/,
    systems = ['PostgreSQL', 'PostGIS', 'geoserver'],
    
    systemChecks = {
        PostgreSQL: function(callback) {
            //error handling omitted
            pg.connect(conString, function(err, client) {
                if (err) {
                    callback(false, err);
                } 
                else {
                    client.query("SELECT NOW() as when", function(qryErr, result) {
                        callback(! qryErr, qryErr);
                    });
                } // if..else
            });
        },
        
        PostGIS: function(callback) {
            //error handling omitted
            pg.connect(conString, function(err, client) {
                if (err) {
                    callback(false, err);
                } 
                else {
                    client.query("select count(*) FROM spatial_ref_sys", function(qryErr, result) {
                        callback(! qryErr, qryErr);
                    });
                } // if..else
            });
        },
        
        geoserver: function(callback) {
            callback(false);
        }
    };

function datasets(geostack, callback, queryParams, req, res, next) {
    var config = geostack.getConfig(),
        datapath = path.resolve(config.datapath || 'data'),
        datasets = [];
        
    fs.readdir(datapath, function(err, files) {
        
        files.forEach(function(file) {
            // if the file is valid, then add it to the list of datasets
            if (! reInvalidDataset.test(file)) {
                datasets.push({
                    id: file
                });
            } // if
        });
        
        callback({
            datasets: datasets
        });
    });
} // datasets

function status(geostack, callback, queryParams, req, res, next) {
    var checkedCount = 0,
        checks = {
            ok: true,
            errors: [],
            systems: []
        };
        
    function checkComplete() {
        checkedCount++;
        if (checkedCount >= systems.length) {
            callback(checks);
        } // if
    } // checkComplete
    
    function checkSystem(systemId) {
        var check = systemChecks[systems[ii]];
        if (check) {
            check(function(passed, err) {
                // flag the system status for the system
                checks.systems.push({
                    id: systemId,
                    status: passed ? 'ok' : 'down'
                });
                
                // update the overall test status
                checks.ok = checks.ok && passed;
                
                // if we did have an error, then report it
                if (! passed) {
                    checks.errors.push(err || (systemId + ' down'));
                } // if
                
                // increment the checked count
                checkComplete();
            });
        }
        else {
            checks.errors.push('WARNING: no check for ' + systems[ii]);
            checkComplete();
        } // if..else
    } // checkSystems
    
    // iterate through the systems we have to check and perform the checks
    for (var ii = 0; ii < systems.length; ii++) {
        checkSystem(systems[ii]);
    } // for
} // status


exports.router = function(app, geostack) {
    app.get('/dash/status', geostack.wrap(status));
    app.get('/dash/datasets', geostack.wrap(datasets));
    
    app.get('/dash', function(req, res) {
        res.ok('hello');
    });
};
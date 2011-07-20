var fs = require('fs'),
    path = require('path'),
    reInvalidDataset = /^(\.|geostack).*$/;

function datasets(stack, callback, queryParams, req, res, next) {
    var config = stack.getConfig(),
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

function status(stack, callback, queryParams, req, res, next) {
    var checkedCount = 0,
        checks = {
            ok: true,
            errors: [],
            connectors: []
        },
        connectors = stack.getConnectors();
        
    function checkComplete() {
        checkedCount++;
        if (checkedCount >= connectors.length) {
            callback(checks);
        } // if
    } // checkComplete
    
    function checkSystem(connector) {
        if (connector.check) {
            connector.check(function(passed, err) {
                // flag the system status for the system
                checks.connectors.push({
                    title: connector.title,
                    status: passed ? 'ok' : 'down'
                });
                
                // update the overall test status
                checks.ok = checks.ok && passed;
                
                // if we did have an error, then report it
                if (! passed) {
                    checks.errors.push(err || (connector.title + ' down'));
                } // if
                
                // increment the checked count
                checkComplete();
            });
        }
        else {
            checks.errors.push('WARNING: no check for ' + connector.title);
            checkComplete();
        } // if..else
    } // checkSystems
    
    if (connectors.length > 0) {
        // iterate through the systems we have to check and perform the checks
        for (var ii = 0; ii < connectors.length; ii++) {
            checkSystem(connectors[ii]);
        } // for
    }
    else {
        callback(checks);
    } // if..else
} // status


exports.router = function(app, stack) {
    app.get('/dash/status', stack.wrap(status));
    app.get('/dash/datasets', stack.wrap(datasets));
    
    app.get('/dash', function(req, res) {
        res.ok('hello');
    });
};
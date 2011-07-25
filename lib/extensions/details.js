var fs = require('fs'),
    path = require('path');

function details(geostack, callback, queryParams, req, res, next) { 
    var dsName = (req.params.dataset || '').replace(':', '_'),
        fileId = path.join(dsName, 'items', req.params.id),
        filePath = path.join(path.resolve(config.datapath || 'data'), fileId + '.json');

    // if the file exists, the load the details
    path.exists(filePath, function(exists) {
        if (exists) {
            fs.readFile(filePath, function(err, data) {
                var result;

                try {
                    if (err) throw err;

                    result = JSON.parse(data);
                }
                catch (e) {
                    result = { error: 'Could not open file' };
                } // try..catch

                callback(result);
            });
        }
        else {
            callback({
                error: 'Not found'
            });
        } // if..else
    });
} // details

exports.router = function(app, stack) {
    app.get('/public/details?/:dataset/:id', stack.wrap(details));
};
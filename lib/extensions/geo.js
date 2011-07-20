function datasetSearch(geostack, callback, queryParams, req, res, next) {
    // require the dataset
    var dataset = require(process.cwd() + '/lib/datasets/' + req.params.dataset),
        dsConfig = extendConfig(dataset.config),
        processor = require('./engines/' + dataset.type).init(dsConfig)[req.params.op];
        
    if (processor) {
        processor(geostack, callback, queryParams, req, res);
    }
    else {
        throw new Error('Dataset does not support the \'' + req.params.op + '\' operation');
    } // if..else
} // datasetSearch

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

exports.init = function(stack) {
    stack.requireConnector('postgres');
    stack.requireConnector('postgis');
    stack.requireConnector('geoserver');
}; // init

exports.router = function(app, stack) {
    app.get('/pois/:dataset/:op', stack.wrap(datasetSearch));
    app.get('/details?/:dataset/:id', stack.wrap(details));
};
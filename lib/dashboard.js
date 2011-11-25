var config = require('config'),
    path = require('path'),
    logger = require('./helpers/loggers/worker'),
    log = logger.writer,
    express = require('express');
    
// initialise the logger type
process.env['STEELMESH_LOGGER_TYPE'] = 'DSH';
    
try {
    var dash = require('steelmesh-dash');
    
    try {
        dash.run(config, path.resolve(__dirname, '../'));
    }
    catch (e) {
        log.error('Unable to initialise dashboard', e);
        throw e;
    }
}
catch (e) {
    var server = express.createServer();
    
    server.get('/', function(req, res) {
        res.send('dashboard not installed, steelmesh-dash addin required\n', 404);
    });

    server.listen(config.dashboard.port);
}

process.on('uncaughtException', function (err) {
    log.error('Unhandled exception: ' + (err ? err.message : ''), err);
    console.log(err.stack);
});
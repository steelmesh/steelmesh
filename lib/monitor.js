var meshstub = {
        config: require('config')
    },
    logger,
    log,
    apploader = require('./apploaders/' + meshstub.config.apploader),
    out = require('out');
    
// initialise the logger type
process.env['STEELMESH_LOGGER_TYPE'] = 'monitor';

// include the logger
logger = require('./helpers/loggers/worker');
log = meshstub.log = logger.writer;
    
// load the apps (passing through a master override of false)
apploader.loadApps(meshstub, function(apps) {
    log.info('monitor started, monitoring ' + apps.length + ' apps');
    out('Application monitor online');
}, false);
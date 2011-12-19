exports.init = function(config, log, callback) {
    var apploader;
    
    // import the apploader module
    log.info('initializing apploader, using the "' + config.apploader + '" apploader');
    apploader = require('./apploaders/' + config.apploader);

    // initialise the apploader
    apploader.init(config, log);
    
    // when the apploader is ready, trigger the callback
    apploader.once('ready', function() {
        if (callback) {
            callback(apploader);
        }
    });
};
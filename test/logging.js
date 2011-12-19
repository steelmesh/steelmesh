var assert = require('assert'),
    path = require('path'),
    fs = require('fs'),
    config = require('config'),
    logPath = path.resolve(__dirname, '../logs'),
    logger = require('../lib/helpers/logger'),
    log = logger('test');
    
describe('logging', function() {
    before(function(done) {
        fs.unlink(path.join(logPath, 'test.log'), function(err) {
            done();
        });
    });
    
    after(function(done) {
        fs.unlink(path.join(logPath, 'test.log'), done);
    });
    
    it('should support logging to different levels', function() {
        assert(log.debug);
        assert(log.info);
        assert(log.warn);
        assert(log.error);
    });
    
    it('should be able to write a simple log line', function(done) {
        log.info('test entry');
        console.log(log.queue);

        // wait for the log to flush
        log.on('flush', function() {
            // check that the file exists
            fs.stat(path.join(logPath, 'test.log'), done);
        });
    });
});
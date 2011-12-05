var assert = require('assert'),
    config = require('config'),
    redis = require('redis'),
    redisClient,
    Messenger = require('../lib/helpers/messaging').Messenger,
    messenger,
    DEFAULT_CHANNEL = 'steelmesh';

describe('messaging via redis', function() {
    before(function(done) {
        redisClient = redis.createClient(config.redis.port, config.redis.host);
        redisClient.on('ready', done);
    });
    
    it('should be able to subscribe to a channel', function(done) {
        messenger = new Messenger();
        messenger.client.on('subscribe', function(channel, count) {
            assert.equal(channel, DEFAULT_CHANNEL);
            done();
        });
    });
    
    it('should be able to receive string messages', function(done) {
        messenger.once('hello', function(payload) {
            assert.equal(payload, 'test');
            done();
        });
        
        redisClient.publish(DEFAULT_CHANNEL, 'hello:_:"test"');
    });
    
    it('should be able to receive object messages', function(done) {
        messenger.once('hello', function(payload) {
            assert.equal(payload.test, true);
            assert.equal(payload.name, 'Tom');
            done();
        });
        
        redisClient.publish(DEFAULT_CHANNEL, 'hello:_:{"test": true, "name": "Tom"}');
    });
});
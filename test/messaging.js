var assert = require('assert'),
    config = require('config'),
    redis = require('redis'),
    redisClient,
    messenger,
    DEFAULT_CHANNEL = 'steelmesh';

describe('messaging via redis', function() {
    before(function(done) {
        redisClient = redis.createClient(config.redis.port, config.redis.host);
        redisClient.on('ready', done);
    });
    
    it('should be able to subscribe to a channel', function(done) {
        messenger = require('../lib/helpers/messaging').create();
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
        
        redisClient.publish(DEFAULT_CHANNEL, '0:_:hello:_:"test"');
    });
    
    it('should be able to receive object messages', function(done) {
        messenger.once('hello', function(payload) {
            assert.equal(payload.test, true);
            assert.equal(payload.name, 'Tom');
            done();
        });
        
        redisClient.publish(DEFAULT_CHANNEL, '0:_:hello:_:{"test": true, "name": "Tom"}');
    });
    
    it('should ignore messages from itself', function(done) {
       messenger.once('hello from', function(payload) {
           assert.equal(payload, 'not myself');
           done();
       });
       
       messenger.send('hello from', 'myself');
       redisClient.publish(DEFAULT_CHANNEL, '0:_:hello from:_:"not myself"');
    });
});
var config = require('config'),
    debug = require('debug')('steelmesh'),
    redis = require('redis'),
    util = require('util'),
    events = require('events');
    
function _createMessage(msgType, payload, callback) {
    if (typeof payload == 'function') {
        payload.call(null, msgType, callback);
    }
    else {
        try {
            callback(null, msgType + ':_:' + JSON.stringify(payload));
        }
        catch (e) {
            callback('Unable to JSONify payload for message: ' + msgType);
        }
    }
} // _createMessage
    
function _parseMessage(channel, message, callback) {
    var msgParts = (message || '').split(':_:'),
        payload;
    
    debug('received message on channel (' + channel + '): ' + message);
    
    if (msgParts[0] && typeof msgParts[1] != 'undefined') {
        try {
            debug('attempting to JSON parse: ' + msgParts[1]);
            callback(null, msgParts[0], JSON.parse(msgParts[1]));
        }
        catch (e) {
            callback('error parsing JSON message payload');
        }
    }
    else {
        callback('message missing :_: delimiter');
    }
} // _parseMessage
    
var Messenger = exports.Messenger = function(opts) {
    var messenger = this;
    
    // intialise opts
    opts = opts || {};
    
    // initialise autosubscribe
    opts.autoSubscribe = typeof opts.autoSubscribe == 'undefined' || opts.autoSubscribe;
    
    // initialise members
    this.subscriptions = [];
    this.client = redis.createClient(config.redis.port, config.redis.host);
    this.channel = opts.channel || 'steelmesh';
    
    // handle messages
    this.client.on('message', function(channel, message) {
        _parseMessage(channel, message, function(err, msgType, payload) {
            if (! err) {
                process.nextTick(function() {
                    debug('emitting message of type "' + msgType + '", with payload: ', payload);
                    messenger.emit(msgType, payload);
                });
            }
            else {
                debug('unparsable message, err = ' + err);
            }
        });
    });
    
    if (opts.autoSubscribe) {
        debug('attempting subscribe to channel: ' + this.channel);
        this.subscribe(this.channel);
    }
};

util.inherits(Messenger, events.EventEmitter);

Messenger.prototype.send = function(message, payload) {
    var messenger = this;
    
    _createMessage(message, payload, function(err, msgText) {
        if (err) {
            messenger.emit('error', err);
            return;
        }

        messenger.client.publish(messenger.channel, msgText);
    });
};

Messenger.prototype.subscribe = function(channel) {
    this.client.subscribe(channel);
    this.subscriptions.push(channel);
};
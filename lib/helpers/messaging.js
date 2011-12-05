var config = require('config'),
    debug = require('debug')('steelmesh-messaging'),
    redis = require('redis'),
    util = require('util'),
    events = require('events'),
    _publisher = redis.createClient(config.redis.port, config.redis.host),
    _delim = ':_:',
    _msgCounter = 0;
    
function _createMessage(id, msgType, payload, callback) {
    if (typeof payload == 'function') {
        payload.call(null, msgType, callback);
    }
    else {
        try {
            callback(null, id + _delim + msgType + _delim + JSON.stringify(payload || ''));
        }
        catch (e) {
            callback('Unable to JSONify payload for message: ' + msgType);
        }
    }
} // _createMessage
    
function _parseMessage(channel, message, callback) {
    var msgParts = (message || '').split(_delim),
        payload;
    
    debug('received message on channel (' + channel + '): ' + message);
    
    if (msgParts[1] && typeof msgParts[2] != 'undefined') {
        try {
            debug('attempting to JSON parse: ' + msgParts[2]);
            callback(null, msgParts[0], msgParts[1], JSON.parse(msgParts[2]));
        }
        catch (e) {
            callback('error parsing JSON message payload');
        }
    }
    else {
        callback('message missing :_: delimiter');
    }
} // _parseMessage
    
var Messenger = function(opts) {
    var messenger = this;
    
    // intialise opts
    opts = opts || {};
    
    // initialise autosubscribe
    opts.autoSubscribe = typeof opts.autoSubscribe == 'undefined' || opts.autoSubscribe;
    
    // initialise members
    this.subscriptions = [];
    this.id = opts.id || process.pid;
    this.client = redis.createClient(config.redis.port, config.redis.host);
    this.channel = opts.channel || 'steelmesh';
    
    // emit the ready event when loaded
    this.client.on('ready', function() {
        messenger.emit('ready', messenger);
    });
    
    // handle messages
    this.client.on('message', function(channel, message) {
        _parseMessage(channel, message, function(err, srcId, msgType, payload) {
            if (! err) {
                // check that the source id is not the messenger id (coerce the comparison)
                if (srcId != messenger.id) {
                    process.nextTick(function() {
                        debug('emitting message of type "' + msgType + '", with payload: ', payload);
                        messenger.emit(msgType, payload);
                    });
                }
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
    
    _createMessage(this.id, message, payload, function(err, msgText) {
        if (err) {
            messenger.emit('error', err);
            return;
        }

        process.nextTick(function() {
            _publisher.publish(messenger.channel, msgText);
        });
    });
};

Messenger.prototype.subscribe = function(channel) {
    this.client.subscribe(channel);
    this.subscriptions.push(channel);
};

exports.create = function(opts, callback) {
    if (typeof opts == 'function') {
        callback = opts;
        opts = {};
    }
    
    new Messenger(opts).once('ready', callback);
};
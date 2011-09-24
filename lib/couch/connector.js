var comfy = require('comfy'),
    events = require('events'),
    util = require('util');

var Connector = exports.Connector = function(config) {
    // initialise the connection
    this.conn = comfy.init(config);
    
    // as a convenience map the connection functions onto the connector
    for (var key in this.conn) {
        if (typeof this.conn[key] == 'function' && this.conn.hasOwnProperty(key)) {
            this[key] = this.conn[key];
        } // if
    } // for
};

util.inherits(Connector, events.EventEmitter);

exports.init = function(mesh, config) {
    var connector = new Connector(config);
    
    // check for an active connection
    connector.get(function(error, res) {
        if (error) {
            mesh.out('!{red}Unable to establish connection to couch: {0}', mesh.config.couchurl);
        }
        else {
            // emit the couch ok event
            connector.emit('ok', res);
        } // if..else
    });
    
    return connector;
};
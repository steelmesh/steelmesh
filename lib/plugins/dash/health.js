var debug = require('debug')('steelmesh-dash'),
    _ = require('underscore'),
    _systems = {};

function _getHealthData(req, page, callback) {
    callback({ 
        systems: _.map(_systems, function(value, key) {
            return _.extend({ id: key }, value);
        })
    });
} // _getHealthData

function _handleHealthUpdate(data) {
    var sysdata = _systems[data.id],
        updateTime = new Date();
    
    // if we don't have system data for the system, then create it
    if (! sysdata) {
        sysdata = _systems[data.id] = {
            subsystems: {}
        };
    }
    
    debug('received system availability update for system: ' + data.id);
    
    // if we have a subsystem, then update the subsystem
    if (data.subsystem) {
        sysdata.subsystems[data.subsystem] = {
            available: data.available,
            updated: updateTime
        };
        
        // update the system availability
        sysdata.available = _.all(_.values(sysdata.subsystems), function(sys) {
            return sys.available;
        });
        
        sysdata.updated = updateTime;
    }
    else {
        sysdata.available = data.available;
        sysdata.updated = updateTime;
    }
} // _handleHealthUpdate

exports.connect = function(server, config, dash, callback) {
    if (dash.messenger) {
        dash.messenger.on('health', _handleHealthUpdate);
    }
    
    callback({
        loaders: {
            health: _getHealthData
        },
        
        nav: [
            { url: '/health', title: 'Health' }
        ]
    });
};

exports.drop = function(server, config) {
    return [
        { action: 'dropLoader', loader: 'health' },
        { action: 'removeNav', url: '/health' }
    ];
};
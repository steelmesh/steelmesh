var Couch = require('./couch');

exports.init = function(config) {
    return new Couch(config);
}; // init
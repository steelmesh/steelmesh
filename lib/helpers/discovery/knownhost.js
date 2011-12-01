exports.discover = function(mesh, opts, callback) {
    // fire the callback 
    // first parameter of true indicates to the server that it is the primary node
    // second parameter passes the config back, however, this should be ignored based on the first parameter
    callback(null, true, this.config);
};
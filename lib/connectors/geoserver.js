exports.title = 'Geoserver';

exports.init = function(stack) {
    stack.log('initialized geoserver connector');
};

exports.check = function(stack, callback) {
    callback(false);
};
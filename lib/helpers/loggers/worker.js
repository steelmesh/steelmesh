var validLevels = ['debug', 'info', 'warn', 'error'],
    writer = {};
    
function _serialize(args) {
    var output = [];
    
    for (var ii = args.length; ii--; ) {
        if (args[ii] && typeof args[ii].stack != 'undefined') {
            output[ii] = {
                message: args[ii].message,
                stack: args[ii].stack
            };
        }
        else {
            output[ii] = args[ii];
        }
    }
    
    return output;
};

validLevels.forEach(function(level) {
    writer[level] = function() {
        process.send({
            loglevel: level,
            args: _serialize(Array.prototype.slice.call(arguments, 0)),
            logger: process.env['STEELMESH_LOGGER_TYPE'] || 'WRK'
        });
    };
});

exports.writer = writer;
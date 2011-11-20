var validLevels = ['debug', 'info', 'warn', 'error'],
    writer = {};

validLevels.forEach(function(level) {
    writer[level] = function() {
        process.send({
            loglevel: level,
            args: Array.prototype.slice.call(arguments, 0)
        });
    };
});

exports.writer = writer;
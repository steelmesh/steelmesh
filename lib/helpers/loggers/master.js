var fs = require('fs'),
    path = require('path'),
    Log = require('log'),
    activeLog,
    lastCheck = 0,
    queuedCallbacks,
    validLevels = ['debug', 'info', 'warn', 'error'],
    writer = {};
    
function _checkLogExists(callback) {
    var checkDiff = Date.now() - lastCheck,
        logpath = path.resolve(__dirname, '../../../logs/events.log');
    
    // check for the log every 5 seconds
    if (checkDiff > 5000 || (! activeLog)) {
        lastCheck = Date.now();
        
        if (! queuedCallbacks) {
            queuedCallbacks = [callback];
            
            fs.stat(logpath, function(err, stats) {
                if (err || (! activeLog)) {
                    activeLog = new Log('debug', fs.createWriteStream(logpath, {
                        flags: err ? 'w' : 'r+',
                        encoding: 'utf8',
                        start: err ? 0 : stats.size
                    }));
                }

                for (var ii = 0; ii < queuedCallbacks.length; ii++) {
                    queuedCallbacks[ii].call(null);
                }
            });
        }
        else {
            queuedCallbacks.push(callback);
        }
    }
    else {
        callback();
    }
} // checkLogExists

function _writeLog(level, pid, role) {
    var args = Array.prototype.slice.call(arguments, 3),
        exceptions = [];
        
    _checkLogExists(function() {
        // iterate through the arguments looking for an exception
        for (var ii = 0; ii < args.length; ii++) {
            if (typeof args[ii] == 'object' && args.stack) {
                exceptions.push(args[ii]);
            }
        }

        activeLog.log(
            (level || 'debug').toUpperCase(),
            [pid + ' ' + role + ' ' + args.join(' ')]);
    });
} // _writeLog

exports.attachWorker = function(worker) {
    worker.on('message', function(msg) {
        if (msg && msg.loglevel) {
            _writeLog.apply(null, [msg.loglevel, worker.pid, 'worker'].concat(msg.args));
        }
    });
};

validLevels.forEach(function(level) {
    writer[level] = function() {
        _writeLog.apply(null, [level, process.pid, 'master'].concat(Array.prototype.slice.call(arguments, 0)));
    };
});

exports.writer = writer;
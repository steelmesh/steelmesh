var fs = require('fs'),
    path = require('path'),
    activeLog,
    lastCheck = 0,
    queuedCallbacks,
    _queue = [],
    validLevels = ['debug', 'info', 'warn', 'error'],
    exceptionsPath = path.resolve(__dirname, '../../../logs/exceptions');
    writer = {};
    
function _checkLogExists(callback) {
    var logpath = path.resolve(__dirname, '../../../logs/events.log');
    
    fs.stat(logpath, function(err, stats) {
        if (err || (! activeLog)) {
            activeLog = fs.createWriteStream(logpath, {
                flags: err ? 'w' : 'r+',
                encoding: 'utf8',
                start: err ? 0 : stats.size
            });
        }
        
        callback();
    });
} // checkLogExists

function _extractExceptions(args) {
    var exceptions = [],
        ii = 0;
    
    // iterate through the arguments and look for exceptions
    while (ii < args.length) {
        if (args[ii] && typeof args[ii].stack != 'undefined') {
            exceptions.push(args[ii]);
            args.splice(ii, 1);
        }
        else {
            ii++;
        }
    }
    
    return exceptions;
} // _extractExceptions

function _saveException(exception, entryTime) {
    var targetFolder = path.join(exceptionsPath, entryTime.toISOString().slice(0, 10)),
        pathExists = path.existsSync(targetFolder);

    // if the path doesn't exist then make the folder
    if (! pathExists) {
        fs.mkdirSync(targetFolder);
    }
    
    // write the exception file
    fs.writeFile(path.join(targetFolder, entryTime.getTime() + '.json'), JSON.stringify(exception), 'utf8');
    
    return entryTime.getTime();
}

function _writeLog(level, pid, role) {
    var args = Array.prototype.slice.call(arguments, 3),
        exceptions = _extractExceptions(args),
        entryTime = new Date();
        
    _queue.push({
        time: entryTime,
        fields: [entryTime.toISOString(), pid, (level || 'debug').toUpperCase(), role].concat(args),
        exceptions: exceptions
    });
} // _writeLog

exports.attachWorker = function(worker) {
    worker.on('message', function(msg) {
        if (msg && msg.loglevel) {
            _writeLog.apply(null, [msg.loglevel, worker.pid, msg.logger].concat(msg.args));
        }
    });
};

exports.flushEvery = function(interval) {
    // clear the log buffer every five seconds
    setInterval(function() {
        var writeItems = [].concat(_queue),
            itemCount = writeItems.length;

        // reset the queued items
        _queue = [];

        // if we have items to write, then do that now
        if (itemCount > 0) {
            _checkLogExists(function() {
                for (var ii = 0; ii < itemCount; ii++) {
                    var exceptionIds = [],
                        exceptionLinks = '';

                    // write exceptions
                    writeItems[ii].exceptions.forEach(function(exception) {
                        exceptionIds.push(_saveException(exception, writeItems[ii].time));
                    });
                    
                    if (exceptionIds.length > 0) {
                        exceptionLinks = ' ${EXCEPTIONS ' + exceptionIds.join(' ') + '}';
                    }
                    
                    activeLog.write(writeItems[ii].fields.join(' ') + exceptionLinks + '\n');
                }
            });
        }
    }, interval);
};

validLevels.forEach(function(level) {
    writer[level] = function() {
        _writeLog.apply(null, [level, process.pid, 'MST'].concat(Array.prototype.slice.call(arguments, 0)));
    };
});

exports.writer = writer;
var fs = require('fs'),
    path = require('path'),
    util = require('util'),
    events = require('events'),
    activeLog,
    lastCheck = 0,
    queuedCallbacks,
    _queue = [],
    validLevels = ['debug', 'info', 'warn', 'error'],
    logPath = path.resolve(__dirname, '../../logs'),
    exceptionsPath = path.join(logPath, 'exceptions'),
    _existsSync = fs.existsSync || fs.existsSync,
    writer = {};
    
/* exception handling helpers */

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
        parentFolder = path.dirname(targetFolder),
        
        // extract just the parts of the exception that we want to serialize
        // this is useful in instances where a custom exception has been created, but 
        // parts of that exception don't serialize to JSON nicely.
        serializableException = {
            message: exception.message || 'Untitled Exception',
            stack: exception.stack || 'No stack trace'
        };

    // if the path doesn't exist then make the folder
    if (! _existsSync(targetFolder)) {
        if (! _existsSync(parentFolder)) {
            fs.mkdirSync(parentFolder);
        }
        
        fs.mkdirSync(targetFolder);
    }
    
    // write the exception file
    fs.writeFile(
        path.join(targetFolder, entryTime.getTime() + '.json'), 
        JSON.stringify(serializableException), 
        'utf8'
    );
    
    return entryTime.getTime();
}

/* Logger definition */
    
function Logger(opts) {
    // initialise options
    opts = opts || {};
    
    // initialise default options
    this.target = opts.target || 'server';
    this.activeLog = null;
    this._debug = require('debug')(this.target);
    
    // initialise the queue
    this.queue = [];
    
    // start the log flushing
    this.flushEvery(opts.flushInterval || 1000);
} // Logger

// support events
util.inherits(Logger, events.EventEmitter);

Logger.prototype.attachWorker = function(worker) {
    var logger = this;
    
    worker.on('message', function(msg) {
        if (msg && msg.loglevel) {
            Logger.prototype.log.apply(logger, [msg.loglevel, worker.pid, msg.logger].concat(msg.args));
        }
    });
}; // attachWorker

Logger.prototype.checkExists = function(callback) {
    var targetFile = path.join(logPath, this.target + '.log'),
        logger = this;
    
    fs.stat(targetFile, function(err, stats) {
        if (err || (! logger.activeLog)) {
            logger.activeLog = fs.createWriteStream(targetFile, {
                flags: err ? 'w' : 'r+',
                encoding: 'utf8',
                start: err ? 0 : stats.size
            });
        }
        
        callback();
    });
}; // checkExists

Logger.prototype.flushEvery = function(interval) {
    var logger = this;
    
    clearInterval(this.flushTimer);
    
    // clear the log buffer every five seconds
    this.flushTimer = setInterval(function() {
        var writeItems = [].concat(logger.queue),
            itemCount = writeItems.length;

        // reset the queued items
        logger.queue = [];

        // if we have items to write, then do that now
        if (itemCount > 0) {
            logger.checkExists(function() {
                for (var ii = 0; ii < itemCount; ii++) {
                    var exceptionLinks = '';

                    // write exceptions
                    writeItems[ii].exceptions.forEach(function(exception) {
                        var exceptionId = _saveException(exception, writeItems[ii].time);
                        exceptionLinks += ' ${exception:' + exceptionId + '}';
                    });

                    // write the active log entry
                    logger.activeLog.write(writeItems[ii].fields.join(' ') + exceptionLinks + '\n');
                    logger.emit('flush');
                }
            });
        }
    }, interval);
}; // flushEvery

Logger.prototype.log = function(level, pid) {
    var args = Array.prototype.slice.call(arguments, 2),
        exceptions = _extractExceptions(args),
        entryTime = new Date();
        
    this._debug.call(this._debug, [(level || 'debug').toUpperCase()].concat(args));
        
    this.queue.push({
        time: entryTime,
        fields: [entryTime.toISOString(), pid, (level || 'debug').toUpperCase()].concat(args),
        exceptions: exceptions
    });
}; // log

validLevels.forEach(function(level) {
    Logger.prototype[level] = function() {
        Logger.prototype.log.apply(this, [level, process.pid].concat(Array.prototype.slice.call(arguments, 0)));
    };
});

module.exports = function(target, opts) {
    // ensure we have options
    opts = opts || {};
    
    // set the target
    opts.target = target || 'server.log';

    // create the logger
    return new Logger(opts);
};
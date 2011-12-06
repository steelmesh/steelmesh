var fs = require('fs'),
    path = require('path'),
    retrieveSize = 1024 * 16,
    logTypes = {
        'events.log': 'events'
    },
    _logpath = path.resolve(__dirname, '../../../logs');
    
function _getException(req, res) {
    var exceptionId, exceptionTime, exceptionPath;

    try {
        exceptionId = parseInt(req.param('exception'), 10);
        exceptionTime = new Date(exceptionId);
    }
    catch (e) {
        res.json({ err: 'Invalid exception id' });
        return;
    }

    exceptionPath = 'exceptions/' + exceptionTime.toISOString().slice(0, 10) + '/' + exceptionId + '.json';
    fs.readFile(path.resolve(_logpath, exceptionPath), 'utf8', function(err, data) {
        if (! err) {
            try {
                res.json(JSON.parse(data));
            }
            catch (e) {
                res.json({ err: 'Invalid exception file' });
            }
        }
        else {
            res.json({ err: 'Could not read exception file: ' + exceptionPath });
        }
    });
} // getException

function _getLogLines(req, res) {
    var logType = logTypes[req.param('log')] || 'access',
        logfile = path.resolve(_logpath, req.param('log')),
        buffer = '';

    fs.stat(logfile, function(err, stats) {
        if (err) {
            callback({ error: 'Not found' });
        }
        else {
            var offset = parseInt(req.param('offset', stats.size), 10),
                stream = fs.createReadStream(logfile, { start: Math.max(offset - retrieveSize, 0), end: offset });

            stream.setEncoding('utf8');
            stream.resume();

            stream.on('data', function(chunk) {
                buffer += chunk;
            });

            stream.on('end', function() {
                var newOffset = Math.max(offset - retrieveSize + buffer.indexOf('\n'), 0),
                    lines = buffer.split('\n').slice(newOffset ? 1 : 0);

                // if the order is reversed, then well, reverse the array
                if (req.param('order', 'desc') === 'desc') {
                    lines = lines.reverse();
                }

                // see if we have the log stream open
                res.json({
                    type: logType,
                    offset: newOffset,
                    size: stats.size,
                    lines: lines,
                    stats: stats
                });
            });
        }
    });
}

function _getLogs(req, page, callback) {
    fs.readdir(_logpath, function(err, files) {
        var logs = [];

        // iterate through the files
        (files || []).forEach(function(file) {
            if (path.extname(file) === '.log') {
                logs.push(file);
            }
        });

        callback({ logs: logs });
    });        
} // _getLogs
    
function _parseAccessLog(lines) {
    return lines;
}

exports.connect = function(server, config, dash, callback) {
    server.get('/log/:log', _getLogLines);
    server.get('/exception/:exception', _getException);
    
    callback({
        loaders: {
            logs: _getLogs
        },
        
        nav: [
            { url: '/logs', title: 'Logs' }
        ]
    });
};

exports.drop = function(server, config) {
    server.remove('/log/:log');
    server.remove('/exception/:exception');
    
    return [
        { action: 'dropLoader', loader: 'logs' },
        { action: 'removeNav', url: '/logs' }
    ];
};
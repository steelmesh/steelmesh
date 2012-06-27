var fs = require ('fs'),
    _ = require('underscore'),
    debug = require('debug')('fsutils'),
    path = require('path');

/**
 * Finds the first file in the first file under the searchPath that matches a regular expression
 * and returns a file
 **/
exports.findFirstIn = function(searchPath, rexp, callback) {
    var results = [];
    fs.readdir(searchPath, function(err, list) {
        if (err && callback) return callback(err);
        
        var missed = [];
                        
        // Attempt to find a matching file in current directory
        var match = _.find(list, function (file) {
            if (rexp.test(file)) {
                if (callback) callback(null, file, searchPath);
                return true;
            } else { 
                missed.push(file);
                return false;
            }
        });
        
        // Successful match
        if (match) return match;
        
        // Search the directories in serial
        var i = 0;
        debug('starting searchNext()');
        (function searchNext() {
            
            debug('in searchNext() for ' + i + '/' + missed.length + ' in searchPath');
            // If we have reached the limit of what can be found in this directory, fire the callback
            if (i >= missed.length) {
                callback(null, null);
                return;
            }
            var file = path.join(searchPath, missed[i++]);
            debug('file = ' + file);
            fs.stat(file, function(err, stat) {
                debug('stat returned ' + stat);
                if (stat && stat.isDirectory()) {
                    debug('searching directory ' + searchPath + '/' + file);
                    // Find any matches in this directory, or the directories below
                    exports.findFirstIn(file, rexp, function (err, foundFile, foundPath) {
                        if (foundFile) {
                            // Pass the callback back up the chain
                            callback(err, foundFile, foundPath);
                        } else {
                            // Continue searching
                            searchNext();
                        }
                    });
                } else {
                    debug('invalid or not directory');
                    searchNext();
                }
            });
        })();
    });
};
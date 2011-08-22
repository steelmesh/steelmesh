var async = require('async'),
    fs = require('fs'),
    path = require('path');
    
function checkDirs(directory, callback) {
    var dirMode = 0x1FF;
    
    // check the existence of the requested directory
    path.exists(directory, function(exists) {
        if (! exists) {
            // check the existence of the parent directory
            path.exists(path.dirname(directory), function(parentExists) {
                // if the parent does not exist, then recurse up the tree
                if (! parentExists) {
                    checkDirs(path.dirname(directory), function() {
                        fs.mkdir(directory, dirMode, callback);
                    });
                }
                // otherwise, create the directory and fire the callback
                else {
                    fs.mkdir(directory, dirMode, callback);
                } // if..else
            });
        }
        else {
            callback();
        } // if..else
    });
} // checkDirs

exports.run = function(mesh, callback) {
    var couch = require('comfy').init({
        url: mesh.config.couchurl,
        db: mesh.config.appdb
    });
    
    function downloadLibrary(libData, callback) {
        // define the attachment path and the local path
        var attachment = libData.id + '/' + libData.key,
            localFile = path.resolve('lib/apps/' + attachment);
            
        checkDirs(path.dirname(localFile), function() {
            couch.get(attachment, function(error, res) {
                if (! error) {
                    fs.writeFile(localFile, res, 'utf8', callback);
                }
                else {
                    mesh.out(('Unable to download attachment: ' + attachment).red);
                    callback();
                }
            });
        });
    } // downloadLibrary
    
    couch.get('_design/default/_view/libs', function(error, res) {
        if (error) {
            mesh.out('Unable to find library dependencies from couchdb'.red);
            callback();
        }
        else {
            async.forEach(res.rows, downloadLibrary, callback);
        } // if..else
    });
}; // run
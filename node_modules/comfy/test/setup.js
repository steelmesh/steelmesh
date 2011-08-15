var comfy = require('../lib/comfy'),
    couch = comfy.init({
        db: 'comfy_test'
    });
    
function deleteExistingDB(callback) {
    console.log('Checking for existing db');
    couch.exists(function(exists) {
        if (exists) {
            console.log('DB exists, deleting');
            couch.del(callback);
        }
        else {
            callback();
        } // if..else
    });
} // deleteExistingDB

function createDB(callback) {
    couch.put(callback);
} // createDB

module.exports = function(callback) {
    deleteExistingDB(function() {
        createDB(function(error, res) {
            if (error) {
                console.log('Error connecting to CouchDB, aborting tests');
                return;
            } // if

            callback(couch);
        });
    });
};
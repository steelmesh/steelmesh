var async = require('async');

require('./setup')(function(couch) {
    // attempt to delete the database without specifying
    couch.del(function(error, res) {
        if (error) {
            console.log(error);
        } // if
    });
});
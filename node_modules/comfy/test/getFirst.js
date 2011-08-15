var async = require('async');

require('./setup')(function(couch) {
    couch.put({ _id: 'c' }, function(error, res) {
        if (! error) {
            // get the first document that matches
            couch.getFirst(['a', 'b', 'c', 'd'], function(error, res) {
                console.log(res);
            });
        } // if
    });
});
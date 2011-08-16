var comfy = require('../lib/comfy'),
    async = require('async'),
    testTitles = ['test 1', 'test 2'];

require('./setup')(function(couch) {
    
    couch.put({ db: 'replication_test' }, function() {
        async.forEach(
            testTitles, 
            function(title, callback) {
                couch.put({
                    title: title
                }, callback);
            }, 
            function(error) {
                couch.post({
                    action: '_replicate',
                    continuous: true,
                    source: couch.db,
                    target: 'replication_test'
                }, function(error, res) {
                    console.log(res);
                });
            }
        );
    });
});
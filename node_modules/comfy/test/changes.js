var async = require('async');

require('./setup')(function(couch) {
    couch.get('_changes?feed=continuous', function(error, res) {
        console.log(res);
    });
    
    couch.put({ title: 'Test 1'});
    couch.put({ title: 'Test 2'});
});
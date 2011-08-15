var async = require('async'),
    testDesign = {
        _id: '_design/default',
        
        views: {
            summary: {
                map: "function(doc) { emit(doc._id, doc.title); }"
            }
        }
    },
    testTitles = ['test 1', 'test 2'];

require('./setup')(function(couch) {
    couch.put(testDesign);
    
    async.forEach(
        testTitles, 
        function(title, callback) {
            couch.put({
                title: title
            }, callback);
        }, 
        function(error) {
            couch.get('_design/default/_view/summary', function(error, res) {
                console.log(res);
            });
        }
    );
});
var async = require('async'),
    couch;

function testDocPut(callback) {
    var doc = {
        title: 'Test Document'
    };
    
    console.log('testing document creation');
    couch.put(doc, callback);
} // testDocPut

function testDocGet(data, callback) {
    console.log('testing document retrieval. getting id: ' + data.id);
    couch.get({ _id: data.id }, callback);
} // testDocGet

function testDocUpdate(data, callback) {
    console.log('testing document update');
    
    data.updated = true;
    couch.put(data, callback);
} // testDocUpdate

require('./setup')(function(couchInstance) {
    couch = couchInstance;
    
    async.waterfall([testDocPut, testDocGet, testDocUpdate], function(error) {
        if (! error) {
            console.log('tests completed successfully');
        } // if
    });
});
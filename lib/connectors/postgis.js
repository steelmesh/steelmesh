var pg = require('pg'),
    conString = 'tcp://postgres:1234@localhost/geostack';

exports.title = 'PostGIS';
exports.check = function(stack, callback) {
    //error handling omitted
    pg.connect(conString, function(err, client) {
        if (err) {
            callback(false, err);
        } 
        else {
            client.query("select count(*) FROM spatial_ref_sys", function(qryErr, result) {
                callback(! qryErr, qryErr);
            });
        } // if..else
    });
};
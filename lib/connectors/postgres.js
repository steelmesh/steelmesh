var pg = require('pg'),
    conString = 'tcp://postgres:1234@localhost/postgres';

exports.title = 'PostgreSQL';
exports.check = function(callback) {
    //error handling omitted
    pg.connect(conString, function(err, client) {
        if (err) {
            callback(false, err);
        } 
        else {
            client.query("SELECT NOW() as when", function(qryErr, result) {
                callback(! qryErr, qryErr);
            });
        } // if..else
    });
};
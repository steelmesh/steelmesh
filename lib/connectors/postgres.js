var pg = require('pg');
    
module.exports = (function() {
    
    /* internals */
    
    var connection = null;
    
    /* exports */
    
    function check(stack, callback) {
        if (connection) {
            connection.query("SELECT NOW() as when", function(qryErr, result) {
                callback(! qryErr, qryErr);
            });
        }
        else {
            callback(false, 'No connection to PostgreSQL');
        } // if..else
    } // check
    
    function init(stack) {
        if (! stack.config.pgUrl) {
            stack.log('PostgreSQL connection string not specified', 'ERROR');
            return;
        } // if

        pg.connect(stack.config.pgUrl, function(err, client) {
            if (err) {
                stack.log('Could not connect to PostgreSQL: ' + err.message, 'ERROR');
            }
            else {
                stack.postgres = connection = client;
            } // if..else
        });
    } // init   
    
    return {
        title: 'PostgreSQL',
        
        check: check,
        init: init
    };
})();
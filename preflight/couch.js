var debug = require('debug')('steelmesh:preflight');

module.exports = function(nano, nginx, config) {
  return function(callback) {
    // if the db is not defined in the configuration error out
    if (! config.couch.dbname) {
      return callback(new Error('missing "dbname" from configuration info'));
    }

    nano.db.list(function(err, dbs) {
      if (err) {
        return callback(err);
      }

      // if the db exists, then we have nothing else to do
      if (dbs.indexOf(config.couch.dbname) >= 0) {
        debug('connected to couch server, found required db');
        return callback();
      }

      // otherwise, attempt to create the db
      debug('connected to couch server, attempting to create db');
      nano.db.create(config.couch.dbname, callback);
    });
  };
};

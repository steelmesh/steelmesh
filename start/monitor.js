var debug = require('debug')('steelmesh:monitor');

module.exports = function(nano, config) {
  return function(callback) {
    var feed = nano.db.follow(config.dbname, { since: 'now' });

    feed.on('change', function(change) {
      debug('captured app update: ', change);
    });

    feed.follow();
    callback();
  };
};

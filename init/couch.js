module.exports = function(nano, config) {
  return function(callback) {
    nano.db.list(function(err, dbs) {
      if (err) {
        return callback(err);
      }
    });
  };
};

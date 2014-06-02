var debug = require('debug')('steelmesh:preflight:nginx');

module.exports = function(nano, config) {
  return function(callback) {
    callback();
  };
};

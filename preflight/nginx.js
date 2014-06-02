var async = require('async');
var debug = require('debug')('steelmesh:preflight:nginx');
var path = require('path');

module.exports = function(nano, nginx, config) {
  return function(callback) {
    async.series([ nginx.scaffold, nginx.start ], callback);
  };
};

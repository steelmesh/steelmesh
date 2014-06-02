var async = require('async');
var out = require('out');
var config = require('rc')('steelmesh', {
  server: 'http://localhost:5984/',
  dbname: 'steelmesh'
});

var nano = require('nano')(config.server);
var appsync = require('steelmesh-appsync');

function preflight(callback) {
  async.parallel([
    require('./preflight/couch')(nano, config)
  ], callback);
}

function init(callback) {
  callback();
}

function start(callback) {
  callback();
}

async.series([preflight, init, start], function(err) {
  if (err) {
    return out.error(err);
  }
});

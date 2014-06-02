var async = require('async');
var out = require('out');
var path = require('path');
var config = require('rc')('steelmesh', {
  server: 'http://localhost:5984/',
  dbname: 'steelmesh',

  appsPath: 'apps'
});

var nano = require('nano')(config.server);
var db = nano.use(config.dbname);

function preflight(callback) {
  async.parallel([
    require('./preflight/couch')(nano, config)
  ], callback);
}

function init(callback) {
  var appsync = require('steelmesh-appsync')(db, {
    targetPath: path.resolve(__dirname, config.appsPath)
  });

  async.parallel([
    appsync
  ], callback);
}

function start(callback) {
  callback();
}

async.series([preflight, init, start], function(err) {
  if (err) {
    return out.error(err);
  }
});

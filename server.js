var async = require('async');
var config = require('rc')('steelmesh', {
  server: 'http://localhost:5984/'
});

var nano = require('nano')(config.server);
var appsync = require('steelmesh-appsync');

function init(callback) {
  async.parallel([
    require('./init/couch')(nano, config)
  ], callback);
}

function start(callback) {
}

async.series([init, start], function(err) {
});

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

/**
  # steelmesh

  Steelmesh is a [Node.js](http://nodejs.org) development / deployment platform
  that works in conjunction with [CouchDB](http://couchdb.apache.org) to keep
  applications up to date and in sync.

  ## Why Use Steelmesh?

  Steelmesh has primarily been designed for hosting "behind the firewall" node
  applications in, dare I say it, enterprise environments.  It really hasn't been
  designed for your next gazillion user startup or other such "webscale"
  deployments.

  What Steelmesh does do a bang up job on though, is making working with
  horizontally scaled, homogeneous clusters, really easy.  Heck it's almost fun.

**/

function preflight(callback) {
  async.parallel([
    require('./preflight/couch')(nano, config)
  ], callback);
}

function init(callback) {
  async.parallel([
    require('steelmesh-appsync')(db, {
      targetPath: path.resolve(__dirname, config.appsPath)
    })
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

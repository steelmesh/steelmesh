var async = require('async');
var out = require('out');
var path = require('path');
var config = require('rc')('steelmesh', {
  couch: {
    url: 'http://localhost:5984/',
    dbname: 'steelmesh'
  },

  appsPath: 'apps',

  nginx: {
    path: 'nginx',
    port: 8900
  }
});

var nano = require('nano')(config.couch.url);
var db = nano.use(config.couch.dbname);
var nginxPath = path.resolve(__dirname, config.nginx.path);
var nginx = require('ngineer')(nginxPath, {
  port: config.nginx.port
});


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
    require('./preflight/couch')(nano, nginx, config),
    require('./preflight/nginx')(nano, nginx, config)
  ], callback);
}

function init(callback) {
  async.parallel([
    require('./init/appsync')(nano, nginx, config)
  ], callback);
}

function start(callback) {
  async.parallel([
    require('./start/monitor.js')(nano, nginx, config)
  ], callback);
}

// resolve the appsPath against the current directory
config.appsPath = path.resolve(__dirname, config.appsPath);

async.series([preflight, init, start], function(err) {
  if (err) {
    return out.error(err);
  }
});

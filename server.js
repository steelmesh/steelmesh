var cluster = require('cluster'),
    app = require('./app');

// create the server
app.cluster = cluster(app.createServer())
    .use(cluster.stats())
    .use(cluster.pidfiles('pids'))
    .use(cluster.cli())
    .use(cluster.repl(8888))
    .listen(3001);

// load the jobs list
app.loadJobs();
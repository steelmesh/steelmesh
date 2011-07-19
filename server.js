var cluster = require('cluster');

cluster('./app')
    .use(cluster.logger('logs'))
    .use(cluster.debug())
    .use(cluster.stats())
    .use(cluster.pidfiles('pids'))
    .use(cluster.cli())
    .use(cluster.repl(8888))
    .use(cluster.reload('lib'))
    .listen(3001);
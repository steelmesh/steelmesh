var cluster = require('cluster'),
    out = require('out');

module.exports = function(mesh, data) {
    if (cluster.isMaster) {
        mesh.activeWorkers = (mesh.activeWorkers || 0) + 1;
        mesh.log.info('worker ' + data.pid + ' online');

        // if the number of active workers, is equal to the number of workers expected
        // then fire the init method
        if (mesh.workers.length > 0 && mesh.activeWorkers >= mesh.workers.length) {
            // flag that we are no longer initializing
            mesh.initializing = false;

            // all workers online, emit the init event
            out('!{green}steelmesh online');
            mesh.log.info('all workers online');
            mesh.emit('init', mesh);
            mesh.status('online');
        }
    }
};
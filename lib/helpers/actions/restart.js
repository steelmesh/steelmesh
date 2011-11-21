var out = require('out');

function _delayKill(workers, timeout) {
    var clones = [].concat(workers);

    // tell the workers to shutdown their express instances
    clones.forEach(function(worker) {
        worker.send({ action: 'shutdown' });
    });
    
    return function() {
        setTimeout(function() {
            // kill the old workers
            clones.forEach(function(worker) {
                worker.kill();
            });
        }, timeout);
    };
} // _delayKill

module.exports = function(mesh, data) {
    out('!{bold}restarting steelmesh');
    
    // clone the current workers
    var killWorkers = _delayKill(mesh.workers, 2000);
    
    setTimeout(function() {
        mesh.log.info('Restarting Steelmesh');

        // kill the monitor
        mesh.monitor.kill();

        // restart mesh
        mesh.start(killWorkers);
    }, mesh.config.restartDelay || 2000);
};
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

function _restart(mesh, data) {
    out('!{bold}restarting steelmesh');
    
    // reset the apploader
    if (mesh.apploader) {
        mesh.apploader.emit('reset');
    }
    
    // restart steelmesh
    mesh.restart(data, _delayKill(mesh.workers, 5000));
} // _restart

module.exports = function(mesh, data) {
    if (mesh.initializing) {
        mesh.removeListener('init', _restart);
        mesh.once('init', _restart);
    }
    else {
        _restart(mesh, data);
    }
};
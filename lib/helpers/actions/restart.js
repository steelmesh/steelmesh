var out = require('out'),
    _ = require('underscore');

function _delayKill(mesh, workers, timeout) {
    var clones = [].concat(workers);
    
    // shutdown old workers
    mesh.messenger.send('action', { 
        action: 'shutdown',
        targets: _.pluck(clones, 'pid')
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
    // restart steelmesh
    mesh.restart(data, _delayKill(mesh, mesh.workers, 5000));
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
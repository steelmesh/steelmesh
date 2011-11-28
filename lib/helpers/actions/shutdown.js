module.exports = function(mesh, data) {
    // close the server
    if (mesh.server) {
        mesh.log.info('shutting down worker');
        
        // when the server closed, exit the process
        mesh.server.on('close', function() {
            mesh.log.info('worker gracefully shutdown');
            process.exit();
        });
        
        mesh.server.close();
        mesh.server = null;
    } // if
};
module.exports = function(mesh, data) {
    var shutdownTimeout = 0;
    
    // close the server
    if (mesh.server) {
        mesh.log.info('shutting down worker');
        
        // when the server closed, exit the process
        mesh.server.on('close', function() {
            mesh.log.info('worker gracefully shutdown');
            clearTimeout(shutdownTimeout);

            process.exit();
        });
        
        // tell the server to close
        mesh.server.close();
        mesh.server = null;
        
        // set a timeout running to kill the worker if the server does not close
        shutdownTimeout = setTimeout(function() {
            mesh.log.info('worker closed after server close timed out');
            process.exit();
        }, 5000);
    } // if
};
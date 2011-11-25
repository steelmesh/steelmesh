module.exports = function(mesh, data) {
    // close the server
    if (mesh.server) {
        mesh.log.info('shutting down worker');
        
        mesh.server.close();
        mesh.server = null;
        
        // close the worker process
        process.exit();
    } // if
};
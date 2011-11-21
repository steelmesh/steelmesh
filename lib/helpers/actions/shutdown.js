module.exports = function(mesh, data) {
    // close the server
    if (mesh.server) {
        mesh.log.info('shutting down express');
        
        mesh.server.close();
        mesh.server = null;
    } // if
};
require('./lib/steelmesh-cluster').init(require('./lib/steelmesh'), function(mesh) {
    mesh.cluster.listen(3001);
    mesh.init();
});
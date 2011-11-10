require('./lib/cluster').init(require('./lib/server'), function(mesh) {
    mesh.init();
});
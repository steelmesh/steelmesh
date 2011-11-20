module.exports = function(mesh, data) {
    if (data.key) {
        process.env[data.key] = data.value;
    }
};
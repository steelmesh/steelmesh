exports.router = function(app, geostack) {
    app.get('/dashboard', function(req, res) {
        res.ok('hello');
    });
};
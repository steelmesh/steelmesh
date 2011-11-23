var config = require('config'),
    path = require('path'),
    express = require('express'),
    app = express.createServer();
    
app.get('/', function(req, res) {
    res.send('dashboard');
});

app.listen(config.dashboard.port);
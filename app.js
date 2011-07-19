var geostack = require('./lib/geostack');

module.exports = geostack.initConfig({
    urls: [
        'http://localhost:8080/geoserver/wfs'
    ],
    datapath: '/usr/local/data/pois'
}).createServer();
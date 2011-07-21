module.exports = require('./lib/stack').init({
    urls: [
        'http://localhost:8080/geoserver/wfs'
    ],
    datapath: '/development/projects/clients/racq/poidata/'
});
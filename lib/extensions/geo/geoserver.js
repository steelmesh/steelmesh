var request = require('request');

exports.init = function(params) {
    var requiredParams = ['urls'],
        configOK = true,
        wfs = require('./wfs'),
        defaultParams = {
            service: 'WFS',
            version: '1.1.0',
            request: 'GetFeature',
            maxFeatures: 200,
            outputFormat: 'JSON'
        };

    /* internals */
    
    function buildUrl(url, args) {
        var qsParts = [],
            key;
        
        for (key in defaultParams) {
            args[key] = args[key] || defaultParams[key];
        } // for
        
        // build the url
        for (key in args) {
            qsParts.push(key + '=' + escape(args[key]));
        } // for
        
        return url + '?' + qsParts.join('&');
    } // buildUrl
    
    function getActiveServer(callback) {
        // TODO: implement some checking of the available servers
        callback(params.urls[0]);
    } // getActiveServer
    
    /* exports */
    
    /**
    ### bbox(queryParams, req, res)
    */
    function bbox(geostack, callback, queryParams, req, res) {
        return {
            result: 'blah'
        };
    } // bbox
    
    /**
    ### cql(queryParams)
    */
    function cql(geostack, callback, queryParams, req, res) {
        getActiveServer(function(url) {
            // constructor the url
            var targetUri = buildUrl(url, {
                    typeName: req.params.dataset,
                    cql_filter: queryParams.cql
                }),
                log = geostack.initLog();
            
            console.log('requesting: ' + targetUri);
            
            // make the request to geoserver
            request({ uri: targetUri }, function(err, response, body) {
                if (! err) {
                    log.checkpoint('Request processed by geoserer');
                    
                    geostack.run(callback, function() {
                        var results = wfs.standardize(body, params);
                        log.checkpoint('Response standardized');
                        
                        return {
                            log: log.getData(),
                            results: results
                        };
                    });
                }
                else {
                    geostack.reportError(callback, 'Invalid response from geoserver: ' + err);
                }
            });
        });
    } // cql
    
    function filter(geostack, callback, queryParams, req, res) {
        var wfsRequest,
            log = geostack.initLog();
        
        if (queryParams.filter) {
            wfsRequest = wfs.makeRequest(params, queryParams.filter);
        }
        else if (queryParams.conditions) {
            wfsRequest = wfs.makeRequest(params, wfs.parseConditions(queryParams.conditions, params));
        } // if..else
        
        if (wfsRequest) {
            console.log(wfsRequest);
            
            getActiveServer(function(url) {
                // make the request to geoserver
                request({
                    method: 'POST',
                    uri: url,
                    headers: {
                        'Content-Type': 'text/xml'
                    },
                    body: wfsRequest
                    
                }, function(err, response, body) {
                    if (! err) {
                        log.checkpoint('Request processed by geoserer');

                        geostack.run(callback, function() {
                            var results = wfs.standardize(body, params);
                            log.checkpoint('Response standardized');

                            return {
                                log: log.getData(),
                                results: results
                            };
                        });
                    }
                    else {
                        geostack.reportError(callback, 'Invalid response from geoserver: ' + err);
                    }
                });
            });
        } // if 
        else {
            geostack.reportError(callback, 'Unable to locate required filter or conditions parameter');
        } // if..else
    } // filter    
    
    /* initialization */
    
    // iterate through and check the required params have been specified
    for (var ii = 0; ii < requiredParams.length; ii++) {
        configOK = configOK && typeof params[requiredParams[ii]] != 'undefined';
    } // for
    
    if (! configOK) {
        throw new Error('Dataset not configured correctly, please contact administrator');
    } // if
    
    for (var key in defaultParams) {
        if (! params[key]) {
            params[key] = defaultParams[key];
        } // if
    } // for
    
    return {
        bbox: bbox,
        cql: cql,
        filter: filter
    };
};
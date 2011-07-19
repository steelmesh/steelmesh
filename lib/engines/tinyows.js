var request = require('request'),
    spawn = require('child_process').spawn,
    libxmljs = require('libxmljs'),
    GeoJS = require('geojs'),
    reXmlDoc = /<\?(.|\r|\n)*/m,
    reContentType = /^Content-Type.*/i,
    reTrailingComma = /\,\]\}$/;

exports.init = function(params) {
    var requiredParams = ['geomField'],
        configOK = true,
        wfs = require('./wfs'),
        defaultParams = {
            kvp: false,
            eastingFirst: true,
            version: '1.1.0',
            request: 'GetFeature',
            maxFeatures: 200,
            outputFormat: 'JSON'
        };

    /* internals */
    
    function execRequest(geostack, callback, requestBody) {
        var tinyProc,
            log = geostack.initLog(),
            results,
            response = '';
            
        console.log(requestBody);
            
        tinyProc = spawn('/usr/local/bin/tinyows', [], {
            env: {
                REQUEST_METHOD: 'POST',
                CONTENT_LENGTH: requestBody.length,
                CONTENT_TYPE: 'text/xml'
            }
        });
        
        tinyProc.stdout.setEncoding('UTF-8');
        tinyProc.stdout.on('data', function(data) {
            response += data;
        });
        
        tinyProc.stderr.setEncoding('UTF-8');
        tinyProc.stderr.on('data', function(data) {
            console.log(data);
        });

        tinyProc.on('exit', function(code) {
            var respTicks = new Date().getTime();
            
            // strip the content type
            response = response.replace(reContentType, '');
            response = response.replace(reTrailingComma, ']}');
                
            log.checkpoint('recevied data from tinyows');
            
            
            try {
                callback({
                    log: log.getData(),
                    results: wfs.standardize(response, params)
                });
            }
            catch (e) {
                callback({
                    log: log.getData(),
                    error: e.message,
                    raw: response
                });
            } // try..catch
            /*
            if (matches) {
                try {
                    // parse the xml document
                    xmldoc = libxmljs.parseXmlString(matches[0]);
                    
                    log.checkpoint('parsed xml');
                    
                    // results = 
                }
                catch (e) {
                    geostack.reportError(callback, e);
                } // try..catch
            } // if
            */
            

            console.log('child process exited with code ' + code);
        });
        
        tinyProc.stdin.write(requestBody);
    } // execFilter
    
    /* exports */
    
    /**
    ### bbox(queryParams, req, res)
    */
    function bbox(geostack, callback, queryParams, req, res) {
        var min = new GeoJS.Pos(queryParams.min),
            max = new GeoJS.Pos(queryParams.max);
        
        /*
        execFilter(geostack, callback, [
            '<ogc:BBOX>' + 
              '<ogc:PropertyName>' + params.geomField + '</ogc:PropertyName>' + 
              '<gml:Envelope srsName="EPSG::4326">' + 
                '<gml:lowerCorner>' + min.lat + ' ' + min.lon + '</gml:lowerCorner>' + 
                '<gml:upperCorner>' + max.lat + ' ' + max.lon + '</gml:upperCorner>' + 
              '</gml:Envelope>' + 
            '</ogc:BBOX>'
        ]);
        */
        
        /*
        '<ogc:Filter xmlns:ogc="http://www.opengis.net/ogc" xmlns:gml="http://www.opengis.net/gml">' + 
        '</ogc:Filter>'
        
        execFilter(geostack, callback, [
            '<BBOX>' + 
              '<PropertyName>' + params.geomField + '</PropertyName>' + 
              '<Box srsName="EPSG::4326">' + 
                '<coordinates>' + min.lon + ',' + min.lat + ' ' + max.lon + ',' + max.lat + '</coordinates>' +
              '</Box>' + 
            '</BBOX>'
        ]);
        */
    } // bbox
    
    function filter(geostack, callback, queryParams, req, res) {
        var request;
        
        if (queryParams.filter) {
            request = wfs.makeRequest(params, queryParams.filter);
        }
        else if (queryParams.conditions) {
            request = wfs.makeRequest(params, wfs.parseConditions(queryParams.conditions, params));
        } // if..else
        
        if (request) {
            execRequest(geostack, callback, request);
        }
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
        filter: filter
    };
};
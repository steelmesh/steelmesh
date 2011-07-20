var GeoJS = require('geojs').include('filters');

exports.filter = function(geostack, callback, queryParams, req, res) {
    console.log(queryParams.filter);
}; // filter

exports.makeRequest = function(params, filter) {
    // ensure output format and version have default values
    params.version = params.version || '1.1.0';
    params.outputFormat = params.outputFormat || (params.version === '1.0.0' ? 'GML2' : 'GML3');
    
    if (params.kvp) {
        return 'service=' + params.service + '&' + 
            'request=' + params.request + '&' + 
            'Typename=' + params.dataset + '&' + 
            'version=' + params.version + '&' + 
            'maxFeatures=' + params.maxFeatures + '&' + 
            'outputformat=' + params.outputFormat + '&' + 
            'filter=' + filter;
    }
    else {
        return '<?xml version="1.0" ?>' + 
            '<wfs:GetFeature ' + 
              'service="WFS" ' + 
              'version="' + params.version + '" ' + 
              (params.maxFeatures ? ('maxFeatures="' + params.maxFeatures + '" ') : '') +
              'outputFormat="' + params.outputFormat.toUpperCase() + '" ' +
              'xmlns:wfs="http://www.opengis.net/wfs" ' + 
              'xmlns:ogc="http://www.opengis.net/ogc" ' + 
              'xmlns:gml="http://www.opengis.net/gml" ' + 
              'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' + 
              'xsi:schemaLocation="http://www.opengis.net/wfs ../wfs/1.1.0/WFS.xsd">' + 
              '<wfs:Query typeName="' + params.dataset + '">' + filter + '</wfs:Query>' + 
            '</wfs:GetFeature>';
    } // if..else
}; // makeRequest

exports.parseConditions = function(conditions, params) {
    return GeoJS.Filters.toOGC(
        GeoJS.Filters.parse(conditions),
        params
    );
}; // parseConditions

exports.standardize = (function() {
    
    function parseFeatures(features, eastingFirst) {
        var results = [],
            latIdx = eastingFirst ? 1 : 0,
            lonIdx = eastingFirst ? 0 : 1;
            
        function getCoordinateBounds(coords) {
            var points = [];
            
            function extractPoints(input) {
                for (var ii = input.length; ii--; ) {
                    if (typeof input[ii] == 'number') {
                        points.push(new GeoJS.Pos(input[latIdx], input[lonIdx]));
                    }
                    else {
                        extractPoints(input[ii]);
                    } // if..else
                } // for
            } // extractPoints
            
            // extract the points from the coordinates
            extractPoints(coords);
            
            return new GeoJS.BBox(points);
        } // getCoordinateBounds
        
        console.log('FEATURES:');
        console.log(features);

        // iterate over the features in the array
        for (var ii = 0; ii < features.length; ii++) {
            var feature = features[ii],
                featureType = (feature.geometry.type || '').toLowerCase(),
                result = feature.properties;
                
            result.geomType = featureType;
            
            // parse geometry
            switch (featureType) {
                case 'point': {
                    result.geom = feature.geometry.coordinates[latIdx] + ' ' + 
                        feature.geometry.coordinates[lonIdx];

                    break;
                } // case point
                
                case 'multipolygon': {
                    result.bounds = getCoordinateBounds(feature.geometry.coordinates);
                    result.position = result.bounds.center().toString();
                    break;
                } // case multipolygon

                default: {
                    throw new Error('Unknown Geometry');
                };
            }

            results[results.length] = result;
        } // for

        return results;
    } // parseFeatures
    
    return function(input, params) {
        try {
            // parse the input
            var data = JSON.parse(input);
            
            // iterate through the features
            if (data.features) {
                return parseFeatures(data.features, params.eastingFirst);
            } // if
        }
        catch (e) {
            throw new Error('Unable to parse response: ' + input);
        } // try..catch
    };
})();
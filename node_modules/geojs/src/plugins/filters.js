
(function(scope) {
    
    // define constants
    var DEFAULT_SRS = 'EPSG:4326',
        reEntities = /(\&(?!\w+\;)|\<|\>|\")/,
        entities = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;'
        };
    
    /* define some helpers */
    
    var gmlHelpers = {
            coords: function(coords, eastingFirst) {
                var output = [];
                
                // output the coordinates
                for (var ii = 0, coordCount = coords.length; ii < coordCount; ii++) {
                    var coord = new GeoJS.Pos(coords[ii]);
                    output[output.length] = eastingFirst ? 
                        (coord.lon + ',' + coord.lat) : 
                        (coord.lat + ',' + coord.lon);
                } // for
                
                return '<gml:coordinates>' + output.join(' ') + '</gml:coordinates>';
            },
            
            envelope: function(args, params) {
                return '<gml:Envelope srs="' + (params.srs || DEFAULT_SRS) + '">' + 
                    '<gml:lowerCorner>' + new GeoJS.Pos(args.min) + '</gml:lowerCorner>' + 
                    '<gml:upperCorner>' + new GeoJS.Pos(args.max) + '</gml:upperCorner>' + 
                    '</gml:Envelope>';
            },
        
            box: function(args, params) {
                return '<gml:Box>' + 
                    gmlHelpers.coords([args.min, args.max], params.eastingFirst) + 
                    '</gml:Box>';
            },
            
            point: function(args, params) {
                return '<gml:Point srs="' + (params.srs || DEFAULT_SRS) + '">' + 
                    gmlHelpers.coords(args.coords, params.eastingFirst) + 
                    '</gml:Point>';
            },
            
            linestring: function(args, params) {
                return '<gml:LineString srs="' + (params.srs || DEFAULT_SRS) + '">' + 
                    gmlHelpers.coords(args.coords, params.eastingFirst) + 
                    '</gml:LineString>';
            }
        },
        ogcHelpers = {
            distance: function(distance, units) {
                return '<ogc:Distance units="' + units + '">' + distance + '</ogc:Distance>';
            },
            
            propName: function(property) {
                return '<ogc:PropertyName>' + property + '</ogc:PropertyName>';
            }
        };
    
    /* define the OGC conversion functions */
    
    function bboxOGC(args, params) {
        return '' + 
            '<ogc:BBOX>' + 
              ogcHelpers.propName(args.property) + 
              gmlHelpers.envelope(args, params) +
            '</ogc:BBOX>';
    } // bboxOGC
    
    function dwithinOGC(args, params) {
        return '' +
            '<ogc:DWithin>' + 
              ogcHelpers.propName(args.property) + 
              ogcHelpers.distance(args.distance, args.units) + 
              gmlHelpers[args.type.toLowerCase()](args, params) +
            '</ogc:DWithin>';
    } // dwithinOGC
    
    function likeOGC(args, params) {
        var matchCase = false;
        if (typeof args.matchCase != 'undefined' && args.matchCase) {
            matchCase = true;
        } // if
        
        return '' + 
            '<ogc:PropertyIsLike wildCard="*" singleChar="?" escapeChar="\\" matchCase="' + matchCase + '">' + 
                ogcHelpers.propName(args.property) + 
                '<ogc:Literal>*' + encodeEntities(args.value) + '*</ogc:Literal>' + 
            '</ogc:PropertyIsLike>';
    } // likeOGC
    
    function compoundOGC(args, param) {
        return '';
    } // compoundOGC
    
    
    /* internals */
    
    var filterSpecs = {
            bbox: {
                req: ['property', 'min', 'max']
            },
            
            dwithin: {
                req: ['property', 'type', 'distance', 'units', 'coords']
            },
        
            like: {
                req: ['property', 'value'],
                opt: ['matchCase']
            },
        
            compound: {
                req: ['operator', 'conditions'] 
            }
        },
        ogcBuilders = {
            bbox: bboxOGC,
            dwithin: dwithinOGC,
            like: likeOGC,
            compound: compoundOGC
        };
        
    function encodeEntities(text) {
        var match = reEntities.exec(text);
        
        while (match) {
            text = text.slice(0, match.index) + 
                (entities[match[0]] || '') + 
                text.slice(match.index + 1);
                
            console.log('text: ' + text);
            match = reEntities.exec(text);
        } // while
        
        return text;
    } // encodeEntities

    function validate(conditions) {
        // iterate through the conditions and check that we know about them
        for (var ii = 0; ii < conditions.length; ii++) {
            var condition = conditions[ii],
                type = condition.type;
            
            if (! filterSpecs[type]) {
                return 'Unknown condition type: ' + type;
            }
            else if (! condition.args) {
                return 'No arguments for condition: ' + type;
            }
            else {
                var reqArgs = filterSpecs[type].req;
                
                // iterate through the required args
                for (var argIdx = 0; argIdx < reqArgs.length; argIdx++) {
                    var argName = reqArgs[argIdx];
                    
                    if (! condition.args[argName]) {
                        return 'Could not find required argument "' + argName + '" for condition: ' + type;
                    } // if
                } // for
            }
        } // for
        
        return undefined;
    } // validate
    
    /* exports */
    
    function parse(conditions) {
        conditions = JSON.parse(conditions);
        
        // firstly validate the filter
        var validationError = validate(conditions);

        if (validationError) {
            throw new Error(validationError);
        } // if
        
        return conditions;
    } // parse
    
    function toOGC(conditions, params) {
        var filter = '';
        
        // iterate through the conditions, and execute each of the ogc builders
        for (var ii = 0; ii < conditions.length; ii++) {
            filter += ogcBuilders[conditions[ii].type](conditions[ii].args, params);
        } // for
        
        return '<ogc:Filter>' + filter + '</ogc:Filter>';
    } // toOGC
    
    scope.Filters = {
        parse: parse,
        toOGC: toOGC
    };
})(typeof module != 'undefined' && module.exports ? module.exports : GeoJS);
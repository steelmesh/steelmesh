(function() {
    
    /* internals */
    
    var customTurnTypeRules = undefined,
        generalize = GeoJS.generalize,
    
        // predefined regexes
        REGEX_BEAR = /bear/i,
        REGEX_DIR_RIGHT = /right/i;
        

    // EN-* manuever text matching rules 
    var DefaultTurnTypeRules = (function() {
        var rules = [];

        rules.push({
            regex: /continue/i,
            turn: 'continue'
        });

        rules.push({
            regex: /(take|bear|turn)(.*?)left/i,
            customCheck: function(text, matches) {
                return 'left' + getTurnAngle(matches[1]);
            }
        });

        rules.push({
            regex: /(take|bear|turn)(.*?)right/i,
            customCheck: function(text, matches) {
                return 'right' + getTurnAngle(matches[1]);
            }
        });

        rules.push({
            regex: /enter\s(roundabout|rotary)/i,
            turn: 'roundabout'
        });

        rules.push({
            regex: /take.*?ramp/i,
            turn: 'ramp'
        });

        rules.push({
            regex: /take.*?exit/i,
            turn: 'ramp-exit'
        });

        rules.push({
            regex: /make(.*?)u\-turn/i,
            customCheck: function(text, matches) {
                return 'uturn' + getTurnDirection(matches[1]);
            }
        });

        rules.push({
            regex: /proceed/i,
            turn: 'start'
        });

        rules.push({
            regex: /arrive/i,
            turn: 'arrive'
        });

        // "FELL THROUGH" - WTF!
        rules.push({
            regex: /fell\sthrough/i,
            turn: 'merge'
        });

        return rules;
    })();
    
    var RouteData = function(params) {
        params = _extend({
            geometry: [],
            instructions: [],
            boundingBox: null
        }, params);
        
        // update the bounding box
        if (! params.boundingBox) {
            params.boundingBox = new GeoJS.BBox(params.geometry);
        } // if
        
        var _self = _extend({
            getInstructionPositions: function() {
                var positions = [];
                    
                for (var ii = 0; ii < params.instructions.length; ii++) {
                    if (params.instructions[ii].position) {
                        positions.push(params.instructions[ii].position);
                    } // if
                } // for
                
                return positions;
            }
        }, params);
        
        return _self;
    }; // RouteData
    
    // include the turntype rules based on the locale (something TODO)
    // TODO: require "localization/turntype-rules.en"
    
    /* internal functions */
    
    function getTurnDirection(turnDir) {
        return REGEX_DIR_RIGHT.test(turnDir) ? '-right' : '-left';
    } // getTurnDirection
    
    function getTurnAngle(turnText) {
        if (REGEX_BEAR.test(turnText)) {
            return '-slight';
        } // if
        
        return '';
    } // getTurnAngle
    
    /* exports */

    /**
    ### calculate(waypoints, success, error, opts)

    Valid options are usually interpreted by the engine, however, the following are
    a list of core options that are usually implemented:
    
    - preference - the routing preference (fastest, shortest, etc)
    */
    function calculate(waypoints, success, error, opts) {
        // find an available routing engine
        var service = T5.Registry.create('service', 'routing');
        if (service) {
            service.calculate(waypoints, function(geometry, instructions) {
                /*
                if (args.generalize) {
                    routeData.geometry = generalize(routeData.geometry, routeData.getInstructionPositions());
                } // if
                */
                
                // if we have a success handler, then call it
                if (success) {
                    success(geometry, instructions);
                } // if
            }, error, opts || {});
        } // if
    } // calculate
    
    function parse(instructions) {
        // calculate the instruction totals
        var totalTime = new GeoJS.Duration(),
            totalDist = new GeoJS.Distance();

        for (var ii = 0, insCount = instructions.length; ii < insCount; ii++) {
            var instruction = instructions[ii],
                // make the text property more tolerant of older version instructions
                text = instruction.text || instruction.description || '';

            // markup the instruction text
            instruction.text = text.replace(/(\w)(\/)(\w)/g, '$1 $2 $3');
            
            // convert the time into a timelord duration
            instruction.time = new GeoJS.Duration(instruction.time);
            
            // add the turn type
            // if the manuever has not been defined, then attempt to parse the description
            if (! instruction.turn) {
                instruction.turn = parseTurnType(instruction.text);
            } // if

            // update the total time and distance for the instruction
            instruction.index = ii;
            instruction.timeTotal = totalTime = totalTime.add(instruction.time);
            instruction.distanceTotal = totalDist = totalDist.add(instruction.distance);
        } // for
        
        return instructions;
    } // parse
    
    /**
    ### parseTurnType(text)
    To be completed
    */
    function parseTurnType(text) {
        var turn = 'unknown',
            rules = customTurnTypeRules || DefaultTurnTypeRules;
        
        // run the text through the manuever rules
        for (var ii = 0; ii < rules.length; ii++) {
            rules[ii].regex.lastIndex = -1;
            
            var matches = rules[ii].regex.exec(text);
            if (matches) {
                // if we have a custom check defined for the rule, then pass the text in 
                // for the manuever result
                if (rules[ii].customCheck) {
                    turn = rules[ii].customCheck(text, matches);
                }
                // otherwise, take the manuever provided by the rule
                else {
                    turn = rules[ii].turn;
                } // if..else
                
                break;
            } // if
        } // for
        
        return turn;
    } // parseTurnType
    
    /**
    ### run(waypoints, options, callback)
    */
    function run(waypoints, options, callback) {
        callback('No routing service implemented');
    } // run
    
    GeoJS.define('routing', {
        calculate: calculate,
        parse: parse,
        parseTurnType: parseTurnType,
        run: run,
        
        RouteData: RouteData
    });
})();
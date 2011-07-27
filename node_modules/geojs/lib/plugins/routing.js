(function() {

    /* internals */

    var customTurnTypeRules = undefined,
        generalize = GeoJS.generalize,

        REGEX_BEAR = /bear/i,
        REGEX_DIR_RIGHT = /right/i;


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
        var service = T5.Registry.create('service', 'routing');
        if (service) {
            service.calculate(waypoints, function(geometry, instructions) {
                /*
                if (args.generalize) {
                    routeData.geometry = generalize(routeData.geometry, routeData.getInstructionPositions());
                } // if
                */

                if (success) {
                    success(geometry, instructions);
                } // if
            }, error, opts || {});
        } // if
    } // calculate

    function parse(instructions) {
        var totalTime = new GeoJS.Duration(),
            totalDist = new GeoJS.Distance();

        for (var ii = 0, insCount = instructions.length; ii < insCount; ii++) {
            var instruction = instructions[ii],
                text = instruction.text || instruction.description || '';

            instruction.text = text.replace(/(\w)(\/)(\w)/g, '$1 $2 $3');

            instruction.time = new GeoJS.Duration(instruction.time);

            if (! instruction.turn) {
                instruction.turn = parseTurnType(instruction.text);
            } // if

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

        for (var ii = 0; ii < rules.length; ii++) {
            rules[ii].regex.lastIndex = -1;

            var matches = rules[ii].regex.exec(text);
            if (matches) {
                if (rules[ii].customCheck) {
                    turn = rules[ii].customCheck(text, matches);
                }
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

/**
# GeoJS.Duration
A Timelord duration is what IMO is a sensible and usable representation of a 
period of "human-time".  A duration value contains both days and seconds values.

## Methods
*/
function Duration(p1, p2) {
    if (typeof p1 == 'number') {
        this.days = p1 || 0;
        this.seconds = p2 || 0;
    }
    else if (typeof p1 != 'undefined') {
        this.days = p1.days || 0;
        this.seconds = p1.seconds || 0;
    } // if..else
} // Duration

Duration.prototype = {
    /**
    ### add(args*)
    The add method returns a new Duration object that is the value of the current
    duration plus the days and seconds value provided.
    */
    add: function() {
        var result = new Duration(this.days, this.seconds);
        
        // iterate through the arguments and add their days and seconds values to the result
        for (var ii = arguments.length; ii--; ) {
            result.days += arguments[ii].days;
            result.seconds += arguments[ii].seconds;
        } // for
        
        return result;
    },
    
    /**
    ### toString()
    Convert the duration to it's string represenation
    
    __TODO__:
    - Improve the implementation
    - Add internationalization support
    */
    toString: function() {
        // TODO: Im sure this can be implemented better....
        
        var days, hours, minutes, totalSeconds,
            output = '';
            
        if (this.days) {
            output = this.days + ' days ';
        } // if
        
        if (this.seconds) {
            totalSeconds = this.seconds;

            // if we have hours, then get them
            if (totalSeconds >= 3600) {
                hours = ~~(totalSeconds / 3600);
                totalSeconds = totalSeconds - (hours * 3600);
            } // if
            
            // if we have minutes then extract those
            if (totalSeconds >= 60) {
                minutes = Math.round(totalSeconds / 60);
                totalSeconds = totalSeconds - (minutes * 60);
            } // if
            
            // format the result
            if (hours) {
                output = output + hours + 
                    (hours > 1 ? ' hrs ' : ' hr ') + 
                    (minutes ? 
                        (minutes > 10 ? 
                            minutes : 
                            '0' + minutes) + ' min ' 
                        : '');
            }
            else if (minutes) {
                output = output + minutes + ' min';
            }
            else if (totalSeconds > 0) {
                output = output + 
                    (totalSeconds > 10 ? 
                        totalSeconds : 
                        '0' + totalSeconds) + ' sec';
            } // if..else
        } // if
        
        return output;
    }
};

var parseDuration = (function() {
    // initialise constants
    var DAY_SECONDS = 86400;
    
    // the period regex (the front half of the ISO8601 post the T-split)
    var periodRegex = /^P(\d+Y)?(\d+M)?(\d+D)?$/,
        // the time regex (the back half of the ISO8601 post the T-split)
        timeRegex = /^(\d+H)?(\d+M)?(\d+S)?$/,
        // initialise the duration parsers
        durationParsers = {
            8601: parse8601Duration
        };
        
    /* internal functions */
    
    /*
    Used to convert a ISO8601 duration value (not W3C subset)
    (see http://en.wikipedia.org/wiki/ISO_8601#Durations) into a
    composite value in days and seconds
    */   
    function parse8601Duration(input) {
        var durationParts = input.split('T'),
            periodMatches = null,
            timeMatches = null,
            days = 0,
            seconds = 0;
        
        // parse the period part
        periodRegex.lastIndex = -1;
        periodMatches = periodRegex.exec(durationParts[0]);
        
        // increment the days by the valid number of years, months and days
        // TODO: add handling for more than just days here but for the moment
        // that is all that is required
        days = days + (periodMatches[3] ? parseInt(periodMatches[3].slice(0, -1), 10) : 0);
        
        // parse the time part
        timeRegex.lastIndex = -1;
        timeMatches = timeRegex.exec(durationParts[1]);
        
        // increment the time by the required number of hour, minutes and seconds
        seconds = seconds + (timeMatches[1] ? parseInt(timeMatches[1].slice(0, -1), 10) * 3600 : 0);
        seconds = seconds + (timeMatches[2] ? parseInt(timeMatches[2].slice(0, -1), 10) * 60 : 0);
        seconds = seconds + (timeMatches[3] ? parseInt(timeMatches[3].slice(0, -1), 10) : 0);

        return new Duration(days, seconds);
    } // parse8601Duration

    return function(duration, format) {
        var parser = durationParsers[format];
        
        // if we don't have a parser for the requested format, then throw an exception
        if (! parser) {
            throw 'No parser found for the duration format: ' + format;
        } // if
        
        return parser(duration);
    };
})();
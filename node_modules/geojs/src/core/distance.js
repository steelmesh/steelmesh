/**
# GeoJS.Distance

## Methods
*/
function Distance(value) {
    if (typeof value == 'string') {
        var uom = (value.replace(/\d|\.|\s/g, '') || 'm').toLowerCase(),
            multipliers = {
                km: 1000
            };

        value = parseFloat(value) * (multipliers[uom] || 1);
    } // if
    
    this.meters = value || 0;
} // Distance

Distance.prototype = {
    /**
    ### add(args*)
    */
    add: function() {
        var total = this.meters;
        
        for (var ii = arguments.length; ii--; ) {
            var dist = typeof arguments[ii] == 'string' ? 
                        new Distance(arguments[ii]) : arguments[ii];

            total += dist.meters;
        } // for
        
        return new Distance(total);
    },
    
    
    /**
    ### radians(value)
    */
    radians: function(value) {
        // if the value is supplied, then set then calculate meters from radians
        if (typeof value != 'undefined') {
            this.meters = value * M_PER_RAD;
            
            return this;
        }
        // otherwise, return the radians from the meter value
        else {
            return this.meters / M_PER_RAD;
        } // if..else
    },
    
    /**
    ### toString()
    */
    toString: function() {
        if (this.meters > M_PER_KM) {
            return ((this.meters / 10 | 0) / 100) + 'km';
        } // if
        
        return this.meters + 'm';
    }
};
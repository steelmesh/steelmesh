/**
# GeoJS.BBox
*/
function BBox(p1, p2) {
    // if p1 is an array, then calculate the bounding box for the positions supplied
    if (p1 && p1.splice) {
        var padding = p2,
            minPos = new Pos(MAX_LAT, MAX_LON),
            maxPos = new Pos(MIN_LAT, MIN_LON);

        for (var ii = p1.length; ii--; ) {
            var testPos = typeof p1[ii] == 'string' ? new Pos(p1[ii]) : p1[ii];
            
            if (testPos) {
                if (testPos.lat < minPos.lat) {
                    minPos.lat = testPos.lat;
                } // if

                if (testPos.lat > maxPos.lat) {
                    maxPos.lat = testPos.lat;
                } // if

                if (testPos.lon < minPos.lon) {
                    minPos.lon = testPos.lon;
                } // if

                if (testPos.lon > maxPos.lon) {
                    maxPos.lon = testPos.lon;
                } // if
            } // if
        } // for
        
        // assign the min and max pos so the size can be calculated
        this.min = minPos;
        this.max = maxPos;
        
        // if the amount of padding is undefined, then calculate
        if (typeof padding == 'undefined') {
            var size = this.size();

            // update padding to be a third of the max size
            padding = Math.max(size.x, size.y) * 0.3;
        } // if

        // update the min and max
        this.min = new Pos(minPos.lat - padding, (minPos.lon - padding) % 360);
        this.max = new Pos(maxPos.lat + padding, (maxPos.lon + padding) % 360);
    }
    else if (p1 && p1.min) {
        this.min = new Pos(p1.min);
        this.max = new Pos(p1.max);
    }
    // otherwise, assign p1 to the min pos and p2 to the max
    else {
        this.min = p1;
        this.max = p2;
    } // if..else
} // BoundingBox

BBox.prototype = {
    constructor: BBox,
    
    /**
    ### bestZoomLevel(viewport)
    */
    bestZoomLevel: function(vpWidth, vpHeight) {
        // get the constant index for the center of the bounds
        var boundsCenter = this.center(),
            maxZoom = 1000,
            variabilityIndex = Math.min(
                Math.round(Math.abs(boundsCenter.lat) * 0.05), 
                LAT_VARIABILITIES.length),
            variability = LAT_VARIABILITIES[variabilityIndex],
            delta = this.size(),
            // interestingly, the original article had the variability included, when in actual reality it isn't, 
            // however a constant value is required. must find out exactly what it is.  At present, though this
            // works fine.
            bestZoomH = Math.ceil(
                Math.log(LAT_VARIABILITIES[3] * vpHeight / delta.y) / Math.LN2),
                
            bestZoomW = Math.ceil(
                Math.log(variability * vpWidth / delta.x) / Math.LN2);

        // _log("constant index for bbox: " + bounds + " (center = " + boundsCenter + ") is " + variabilityIndex);
        // _log("distances  = " + delta);
        // _log("optimal zoom levels: height = " + bestZoomH + ", width = " + bestZoomW);

        // return the lower of the two zoom levels
        return Math.min(
            isNaN(bestZoomH) ? maxZoom : bestZoomH, 
            isNaN(bestZoomW) ? maxZoom : bestZoomW
        );
    },

    /**
    ### center()
    */
    center: function() {
        // calculate the bounds size
        var size = this.size();
        
        // create a new position offset from the current min
        return new Pos(this.min.lat + size.y / 2, this.min.lon + size.x / 2);
    },
    
    /**
    ### expand(amount)
    */
    expand: function(amount) {
        return new BBox(
            new Pos(this.min.lat - amount, (this.min.lon - amount) % 360),
            new Pos(this.max.lat + amount, (this.max.lon + amount) % 360)
        );
    },
    
    /**
    ### size(normalize)
    */
    size: function(normalize) {
        var size = {
            x: 0, 
            y: this.max.lat - this.min.lat
        };
        
        if (typeof normalize != 'undefined' && normalize && (this.min.lon > this.max.lon)) {
            size.x = 360 - this.min.lon + this.max.lon;
        }
        else {
            size.x = this.max.lon - this.min.lon;
        } // if..else

        return size;        
    },
    
    /**
    ### toString()
    */
    toString: function() {
        return "min: " + this.min + ", max: " + this.max;
    },
    
    /**
    ### union
    */
    union: function() {
        var minPos = this.min.copy(),
            maxPos = this.max.copy();
        
        // iterate through the arguments and determine the min and max bounds
        for (var ii = arguments.length; ii--; ) {
            if (arguments[ii]) {
                var testMin = arguments[ii].min,
                    testMax = arguments[ii].max;

                minPos.lat = Math.min(minPos.lat, testMin.lat);
                minPos.lon = Math.min(minPos.lon, testMin.lon);
                maxPos.lat = Math.max(maxPos.lat, testMax.lat);
                maxPos.lon = Math.max(maxPos.lon, testMax.lon);
            } // if
        } // for
        
        return new BBox(minPos, maxPos);
    }
};
/**
# GeoJS.Pos 

## Methods

### bearing(target)
Return the bearing in degrees to the target position.

### copy()
Return a copy of the position

### distanceTo(target)
Calculate the distance to the specified target position.  The distance
returned is in KM.

### equalTo(testPos)
Determine whether or not the position is equal to the test position.

### empty()
Return true if the position is empty

### to(dest, distance)
Calculate the position that sits between the destination Pos for the given distance.

*/
function Pos(p1, p2, radius) {
    // if the first parameter is a string, then parse the value
    if (p1 && p1.split) {
        var coords = p1.split(reDelimitedSplit);
        
        if (coords.length > 1) {
            p1 = coords[0];
            p2 = coords[1];
        } // if
    }
    // otherwise if a position has been passed to the position, then 
    // we will create a new position as a copy of that position
    else if (p1 && p1.lat) {
        p2 = p1.lon;
        p1 = p1.lat;
    } // if..else
    
    // initialise the position
    this.lat = parseFloat(p1 || 0);
    this.lon = parseFloat(p2 || 0);
    this.radius = radius || KM_PER_RAD;
} // Pos constructor

Pos.prototype = {
    constructor: Pos,

    // adapted from: http://www.movable-type.co.uk/scripts/latlong.html
    bearing: function(target) {
        var lat1 = this.lat * DEGREES_TO_RADIANS,
            lat2 = target.lat * DEGREES_TO_RADIANS,
            dlon = (target.lon - this.lon) * DEGREES_TO_RADIANS,
            y = Math.sin(dlon) * Math.cos(lat2),
            x = Math.cos(lat1) * Math.sin(lat2) -
                Math.sin(lat1) * Math.cos(lat2) * Math.cos(dlon),
            brng = Math.atan2(y, x);

        return (brng * RADIANS_TO_DEGREES + 360) % 360;        
    },
    
    copy: function() {
        return new Pos(this.lat, this.lon);
    },
    
    distanceTo: function(pos) {
        if ((! pos) || this.empty() || pos.empty()) {
            return 0;
        } // if
        
        var halfdelta_lat = ((pos.lat - this.lat) * DEGREES_TO_RADIANS) / 2;
        var halfdelta_lon = ((pos.lon - this.lon) * DEGREES_TO_RADIANS) / 2;

        // TODO: find out what a stands for, I don't like single char variables in code (same goes for c)
        var a = Math.sin(halfdelta_lat) * Math.sin(halfdelta_lat) + 
                (Math.cos(this.lat * DEGREES_TO_RADIANS) * Math.cos(pos.lat * DEGREES_TO_RADIANS)) * 
                (Math.sin(halfdelta_lon) * Math.sin(halfdelta_lon)),
            c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        // calculate the distance
        return this.radius * c;
    },
    
    equalTo: function(testPos) {
        return pos && (this.lat === testPos.lat) && (this.lon === testPos.lon);
    },
    
    empty: function() {
        return this.lat === 0 && this.lon === 0;
    },
    
    /**
    ### inArray(testArray)
    */
    inArray: function(testArray) {
        if (testArray) {
            for (var ii = testArray.length; ii--; ) {
                if (this.equal(testArray[ii])) {
                    return true;
                } // if
            } // for
        } // if
        
        return false;
    },
    
    /**
    ### offset(latOffset, lonOffset)
    Return a new position which is the original `pos` offset by
    the specified `latOffset` and `lonOffset` (which are specified in 
    km distance)
    */
    offset: function(latOffset, lonOffset) {
        var radOffsetLat = latOffset / this.radius,
            radOffsetLon = lonOffset / this.radius,
            radLat = this.lat * DEGREES_TO_RADIANS,
            radLon = this.lon * DEGREES_TO_RADIANS,
            newLat = radLat + radOffsetLat,
            deltaLon = Math.asin(Math.sin(radOffsetLon) / Math.cos(radLat)),
            newLon = radLon + deltaLon;
           
        // if the new latitude has wrapped, then update
        newLat = ((newLat + HALF_PI) % Math.PI) - HALF_PI;
        newLon = newLon % TWO_PI;
        
        return new Pos(newLat * RADIANS_TO_DEGREES, newLon * RADIANS_TO_DEGREES);
    },
    
    // adapted from: http://www.movable-type.co.uk/scripts/latlong.html
    to: function(bearing, distance) {
        // if the bearing is specified as an object, then assume
        // we have been passed a position so get the bearing
        if (typeof bearing == 'object') {
            bearing = this.bearing(bearing);
        } // if
        
        var radDist = distance / this.radius,
            radBearing = bearing * DEGREES_TO_RADIANS,
            lat1 = this.lat * DEGREES_TO_RADIANS,
            lon1 = this.lon * DEGREES_TO_RADIANS,
            lat2 = Math.asin(Math.sin(lat1) * Math.cos(radDist) + 
                    Math.cos(lat1) * Math.sin(radDist) * Math.cos(radBearing)),
            lon2 = lon1 + Math.atan2(
                    Math.sin(radBearing) * Math.sin(radDist) * Math.cos(lat1), 
                    Math.cos(radDist) - Math.sin(lat1) * Math.sin(lat2)
            );
            
      // normalize the longitude
      lon2 = (lon2+3*Math.PI)%(2*Math.PI) - Math.PI;  // normalise to -180...+180

      return new Pos(lat2 * RADIANS_TO_DEGREES, lon2 * RADIANS_TO_DEGREES);
    },
    
    /**
    ### toBounds(distance)
    This function is very useful for creating a Geo.BoundingBox given a 
    center position and a radial distance (specified in KM) from the center 
    position.  Basically, imagine a circle is drawn around the center 
    position with a radius of distance from the center position, and then 
    a box is drawn to surround that circle.  Adapted from the [functions written 
    in Java by Jan Philip Matuschek](http://janmatuschek.de/LatitudeLongitudeBoundingCoordinates)
    */
    toBounds: function(distance) {
        var radDist = distance.radians(),
            radLat = this.lat * DEGREES_TO_RADIANS,
            radLon = this.lon * DEGREES_TO_RADIANS,
            minLat = radLat - radDist,
            maxLat = radLat + radDist,
            minLon, maxLon;

        // COG.Log.info("rad distance = " + radDist);
        // COG.Log.info("rad lat = " + radLat + ", lon = " + radLon);
        // COG.Log.info("min lat = " + minLat + ", max lat = " + maxLat);

        if ((minLat > MIN_LAT_RAD) && (maxLat < MAX_LAT_RAD)) {
            var deltaLon = Math.asin(Math.sin(radDist) / Math.cos(radLat));

            // determine the min longitude
            minLon = radLon - deltaLon;
            if (minLon < MIN_LON_RAD) {
                minLon += TWO_PI;
            } // if

            // determine the max longitude
            maxLon = radLon + deltaLon;
            if (maxLon > MAX_LON_RAD) {
                maxLon -= TWO_PI;
            } // if
        }
        else {
            minLat = Math.max(minLat, MIN_LAT_RAD);
            maxLat = Math.min(maxLat, MAX_LAT_RAD);
            minLon = MIN_LON;
            maxLon = MAX_LON;
        } // if..else

        return new BBox(
            new Pos(minLat * RADIANS_TO_DEGREES, minLon * RADIANS_TO_DEGREES), 
            new Pos(maxLat * RADIANS_TO_DEGREES, maxLon * RADIANS_TO_DEGREES));
    },
    
    /**
    ### toString()
    */
    toString: function(delimiter) {
        return this.lat + (delimiter || ' ') + this.lon;
    },
    
    /**
    ### valid()
    */
    valid: function() {
        return !(isNaN(this.lat) || isNaN(this.lon));
    }
};
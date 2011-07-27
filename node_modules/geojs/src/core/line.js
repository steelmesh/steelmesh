/**
# GeoJS.Line

## Constructor

    new GeoJS.Line(positions);
    
## Methods

### distance()
The distance method is used to return the distance between the 
positions specified in the Line.  A compound value is returned from the 
method in the following form:

    {
        total: 0, // the total distance from the start to end position
        segments: [], // distance segments, 0 indexed. 0 = distance between pos 0 + pos 1
    }
    
### traverse(distance, distData)
This method is used to traverse along the line by the specified distance (in km). The method
will return the position that equates to the end point from travelling the distance.  If the 
distance specified is longer than the line, then the end of the line is returned.  In some
cases you would call this method after a call to the `distance()` method, and if this is the 
case it is best to pass that distance data in the `distData` argument.  If not, this will
be recalculated.

*/
function Line(positions) {
    this.positions = [];
    
    // iterate through the positions and if we have text, then convert to a position
    for (var ii = positions.length; ii--; ) {
        if (typeof positions[ii] == 'string') {
            this.positions[ii] = new Pos(positions[ii]);
        }
        // if not a string, then just get a copy of the position passed
        // line functions are non-destructive so a copy is probably best
        // TODO: evaluation whether a copy should be used
        else {
            this.positions[ii] = positions[ii];
        } // if..else
    } // for
} // Line

Line.prototype = {
    constructor: Line,
  
    distance: function() {
        var totalDist = 0,
            segmentDistances = [],
            distance;
        
        // iterate through the positions and return 
        for (var ii = this.positions.length - 1; ii--; ) {
            // calculate the distance between this node and the next
            distance = this.positions[ii].distanceTo(this.positions[ii + 1]);
            
            // update the total distance and segment distances
            totalDist += segmentDistances[ii] = distance;;
        } // for

        // return a distance object
        return {
            total: totalDist,
            segments: segmentDistances
        };
    },
    
    traverse: function(distance, distData) {
        var elapsed = 0,
            posIdx = 0;
        
        // initialise the distance data if not provided (or invalid)
        if ((! distData) || (! distData.segments)) {
            distData = this.distance();
        } // if
        
        // if the traversal distance is greater than the line distance
        // then return the last position
        if (distance > distData.total) {
            return this.positions[this.positions.length - 1];
        }
        // or, if the distance is negative, then return the first position
        else if (distance <= 0) {
            return this.positions[0];
        }
        // otherwise, calculate the distance
        else {
            // find the position in the 
            while (posIdx < distData.segments.length) {
                elapsed += distData.segments[posIdx];
                
                // if the elapsed distance is greater than the required
                // distance, decrement the index by one and break from the loop
                if (elapsed > distance) {
                    // remove the last distance from the elapsed distance
                    elapsed -= distData.segments[posIdx];
                    break;
                } // if
                
                // increment the pos index
                posIdx++;
            } // while

            // TODO: get the position between this and the next position
            if (posIdx < this.positions.length - 1) {
                var pos1 = this.positions[posIdx],
                    pos2 = this.positions[posIdx + 1],
                    bearing = pos1.bearing(pos2);
                    
                return pos1.to(bearing, distance - elapsed);
            }
            else {
                return this.positions[posIdx];
            } // if..else
        } // if..else
    }
};
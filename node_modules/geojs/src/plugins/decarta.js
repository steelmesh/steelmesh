// ensure that we have addressing
GeoJS.include('addressing,routing', function(addressing, routing) {
    //= require <cog/cogs/jsonp>
    
    //= require "decarta/routing"
    
    // assign the decarta routing method
    routing.run = function(waypoints, options, callback) {
        callback('Decarta routing engine needs to be implemented');
    }; 
});
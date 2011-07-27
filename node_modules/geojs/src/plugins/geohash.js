/**
# GeoJS.Geohash

Adapted from Dave Troy's [implementation](https://github.com/davetroy/geohash-js)
*/
(function(scope) {
    
    /* internals */
    
    var BITS = [16, 8, 4, 2, 1],
        BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz',
        NEIGHBORS = {
            right: {
                even: 'bc01fg45238967deuvhjyznpkmstqrwx'
            },
            left: {
                even: '238967debc01fg45kmstqrwxuvhjyznp'
            },
            top: {
                even: 'p0r21436x8zb9dcf5h7kjnmqesgutwvy'
            },
            bottom: {
                even: '14365h7k9dcfesgujnmqp0r2twvyx8zb'
            }
        },
        BORDERS = {
            right: {
                even: 'bcfguvyz'
            },
            left: {
                even: '0145hjnp'
            },
            top: {
                even: 'prxz'
            },
            bottom: {
                even: '028b'
            }
        };

    NEIGHBORS.bottom.odd = NEIGHBORS.left.even;
    NEIGHBORS.top.odd = NEIGHBORS.right.even;
    NEIGHBORS.left.odd = NEIGHBORS.bottom.even;
    NEIGHBORS.right.odd = NEIGHBORS.top.even;

    BORDERS.bottom.odd = BORDERS.left.even;
    BORDERS.top.odd = BORDERS.right.even;
    BORDERS.left.odd = BORDERS.bottom.even;
    BORDERS.right.odd = BORDERS.top.even;

    function refineInterval(interval, cd, mask) {
        if (cd&mask) {
            interval[0] = (interval[0] + interval[1])/2;
        }
        else {
            interval[1] = (interval[0] + interval[1])/2;
        } // if..else
    }

    function calculateAdjacent(srcHash, dir) {
        var lastChr, type, base;
        
        srcHash = srcHash.toLowerCase();
        lastChr = srcHash.charAt(srcHash.length-1);
        type = (srcHash.length % 2) ? 'odd' : 'even';
        base = srcHash.substring(0,srcHash.length-1);
        
        if (BORDERS[dir][type].indexOf(lastChr)!=-1) {
            base = calculateAdjacent(base, dir);
        } // if
            
        return base + BASE32[NEIGHBORS[dir][type].indexOf(lastChr)];
    }
    
    /* exports */

    function decode(geohash) {
        var isEven = 1,
            lat = [ -90.0,  90.0], 
            lon = [-180.0, 180.0],
            latErr = lat[0],
            lonErr = lon[1];
            
        for (var ii = 0; ii < geohash.length; ii++) {
            var cd = BASE32.indexOf(geohash[ii]);
            
            for (var jj = 0; jj < 5; jj++) {
                var mask = BITS[jj];
                
                if (isEven) {
                    lonErr /= 2;
                    refineInterval(lon, cd, mask);
                } 
                else {
                    latErr /= 2;
                    refineInterval(lat, cd, mask);
                } // if..else
                
                // toggle the is even state
                isEven ^= 1;
            } // for
        } // for
        
        lat[2] = (lat[0] + lat[1])/2;
        lon[2] = (lon[0] + lon[1])/2;

        return new GeoJS.Pos(lat, lon);
    }

    function encode(pos) {
        var isEven = 1,
            ii = 0,
            lat = [ -90.0,  90.0],
            lon = [-180.0, 180.0],
            bit = 0,
            ch = 0,
            precision = 12,
            geohash = '',
            mid;

        while (geohash.length < precision) {
            if (isEven) {
                mid = (lon[0] + lon[1]) / 2;
                
                if (pos.lon > mid) {
                    ch |= BITS[bit];
                    lon[0] = mid;
                } 
                else {
                    lon[1] = mid;
                } // if..else
            }
            else {
                mid = (lat[0] + lat[1]) / 2;
                
                if (pos.lat > mid) {
                    ch |= BITS[bit];
                    lat[0] = mid;
                }
                else {
                    lat[1] = mid;
                } // if..else
            } // if..else

            isEven ^= 1;
            if (bit < 4) {
                bit++;
            }
            else {
                geohash += BASE32[ch];
                bit = 0;
                ch = 0;
            } // if..else
        } // while
        
        return geohash;
    } // encode
    
    scope.Geohash = {
        decode: decode,
        encode: encode
    };
})(typeof module != 'undefined' && module.exports ? module.exports : GeoJS);
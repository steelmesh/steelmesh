describe('geohash', function() {
    var positions = [
            new GeoJS.Pos('-27.467379 153.192271')
        ],
        hashes = [
            'r7hgtzxnytkq'
        ];

    it('can encode positions to hashes', function() {
        for (var ii = 0; ii < positions.length; ii++) {
            var hash = GeoJS.Geohash.encode(positions[ii]);
            expect(hash).toEqual(hashes[ii]);
        } // for
    });
    
    it('can decode hashes into position objects', function() {
        for (var ii = 0; ii < hashes.length; ii++) {
            var pos = GeoJS.Geohash.decode(hashes[ii]);
            
            // test positions to 3 decimal precision
            expect((pos.lat * 1000) | 0).toEqual((positions[ii].lat * 1000) | 0);
            expect((pos.lon * 1000) | 0).toEqual((positions[ii].lon * 1000) | 0);
        } // for
    });
});
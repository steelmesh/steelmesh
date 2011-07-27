describe('line', function() {
    var testPositions = [
            new GeoJS.Pos(-27.47399, 153.11752),
            new GeoJS.Pos(-27.47408, 153.11788),
            new GeoJS.Pos(-27.47438, 153.11908),
            new GeoJS.Pos(-27.47443, 153.11937)
        ],
        
        testPositionsText = [
            '-27.47399, 153.11752',
            '-27.47408, 153.11788',
            '-27.47438, 153.11908',
            '-27.47443, 153.11937'
        ],
        
        segmentMeters = [36, 122, 29];
    
    it('can be initialized from a position array', function() {
        var line = new GeoJS.Line(testPositions);

        expect(line.positions.length).toEqual(4);
    });
    
    it('can be initialized from an array of text', function() {
        var line = new GeoJS.Line(testPositionsText);

        expect(line.positions.length).toEqual(4);
    });

    // test the distance function
    it('has a distance that can be calculated', function() {
        var distance = new GeoJS.Line(testPositions).distance(),
            totalMeters = Math.floor(distance.total * 1000);
            
        expect(totalMeters).toEqual(189);
        
        // check the segment meters
        for (var ii = 0; ii < segmentMeters.length; ii++) {
            expect(Math.floor(distance.segments[ii] * 1000)).toEqual(segmentMeters[ii]);
        } // for
    });
    
    // test that we can traverse the line
    it('can be traversed', function() {
        var pos = new GeoJS.Line(testPositions).traverse(0.1);
        checkPos(pos, '-27.474 153.118');
    });
});
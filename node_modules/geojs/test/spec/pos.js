describe('pos', function() {
    var basePos = new GeoJS.Pos(-27, 153);
    
    it('can be initialized from floating point values', function() {
        expect(basePos.lat).toEqual(-27);
        expect(basePos.lon).toEqual(153);
    });
    
    it('is able to project a position from a point given a bearing and distance', function() {
        var testPos = basePos.to(180, 100);
        checkPos(testPos, '-27.899 153', 3);
    });
});
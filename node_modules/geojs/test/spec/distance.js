describe('distance', function() {
    it('can be initialized from an integer value', function() {
        var dist = new GeoJS.Distance(5);
        expect(dist.meters).toEqual(5);
    });
    
    it('can be initialized from a float value', function() {
        var dist = new GeoJS.Distance(10.4);
        expect(dist.meters).toEqual(10.4);
    });
    
    it('can parse the string "10M"', function() {
        var dist = new GeoJS.Distance('10M');
        expect(dist.meters).toEqual(10);
    });
    
    it('can parse the string "10 m"', function() {
        var dist = new GeoJS.Distance('10 m');
        expect(dist.meters).toEqual(10);
    });

    it('can parse the string "10KM"', function() {
        var dist = new GeoJS.Distance('10KM');
        expect(dist.meters).toEqual(10000);
    });
    
    it('can parse the string "0.01KM"', function() {
        var dist = new GeoJS.Distance('0.01KM');
        expect(dist.meters).toEqual(10);
    });
    
    it('can parse the string "0.01 Km"', function() {
        var dist = new GeoJS.Distance('0.01 Km');
        expect(dist.meters).toEqual(10);
    });

    it('can parse the string "10"', function() {
        var dist = new GeoJS.Distance('10');
        expect(dist.meters).toEqual(10);
    });
});
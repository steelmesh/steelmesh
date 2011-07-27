(function() {
    
    /* internals */
    
    var loadedPlugins = {},
        reTrim = /^(.*)\s+$/,
        reDots = /\./g;
    
    function define(id, definition) {
        loadedPlugins[id] = definition;
    } // define
    
    function findPlugins(input) {
        var plugins = input.split(','),
            requestedPlugins = [];

        for (var ii = 0; ii < plugins.length; ii++) {
            var pluginId = plugins[ii].replace(reTrim, '$1').replace(reDots, '/');
            requestedPlugins[ii] = loadedPlugins[pluginId];
        } // for
        
        return requestedPlugins;
    } // findPlugins

    function require(input, callback) {
        var plugins = input.split(','),
            allLoaded = true,
            labLoader = typeof $LAB !== 'undefined' ? $LAB : null,
            pluginName;

        for (var ii = 0; ii < plugins.length; ii++) {
            var pluginId = plugins[ii].replace(reTrim, '$1').replace(reDots, '/'),
                plugin;

            if (! loadedPlugins[pluginId]) {
                // unset the all loaded flag
                allLoaded = false;
                
                if (IS_COMMONJS) {
                    plugin = require('./plugins/' + pluginId);
                }
                else if (labLoader) {
                    // TODO: add $LABjs loading here also
                } // if..else
            } // for
        } // for

        if (callback) {
            if (IS_COMMONJS || allLoaded) {
                callback.apply(GeoJS, findPlugins(input));
            }
            else if (labLoader) {
                $LAB.wait(function() {
                    callback.apply(GeoJS, findPlugins(input));
                });
            } // if..else
        } // if

        return GeoJS;
    } // include
    
    //= require "core/constants"
    //= require "core/pos"
    //= require "core/line"
    //= require "core/bbox"
    //= require "core/distance"
    
    //= require "core/functions"
    
    //= require "core/duration"
    
    var GeoJS = this.GeoJS = {
        Pos: Pos,
        Line: Line,
        BBox: BBox,
        Distance: Distance,
        
        generalize: generalize,
        
        // time types and helpers
        Duration: Duration,
        parseDuration: parseDuration,
        
        define: define,
        require: require
    };
    
    if (IS_COMMONJS) {
        module.exports = GeoJS;
    } // if
})();
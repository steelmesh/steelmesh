var vows = require('vows'),
    assert = require('assert');
    
vows.describe('Extension Management').addBatch({
    'loading extensions': {
        topic: function() {
            return require('../lib/geostack/extensions');
        },
        
        defined: function(topic) {
            assert.isNotNull(topic);
        },
        
        'can iterate': function(topic) {
            topic.each(function() {
                assert.isNotNull(this);
            });
        }
    }
}).export(module);
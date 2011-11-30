var _ = require('underscore'),
    reAddin = /^steelmesh\-/i,
    npm,
    npmLoaded = false;
    
function _gatherPackageData(mesh) {
    npm.commands.ls([], true, function(err, data) {
        if (! err) {
            var values = _.map(data.dependencies || {}, function(value, key) {
                return reAddin.test(key) ? {
                    name: value.name,
                    version: value.version
                } : '';
            });
            
            mesh.state('addins', _.without(values, ''));
        }
    });
} // _gatherPackageData

exports.collect = function(mesh) {
    // if npm has loaded, then report package information
    if (npm && npmLoaded) {
        _gatherPackageData(mesh);
    }
    else if (npm) {
        npm.load(function() {
            npmLoaded = true;
            _gatherPackageData(mesh);
        });
    }
};

// try and include npm
try {
    npm = require('npm');
}
catch (e) {
}
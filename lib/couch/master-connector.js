var async = require('async'),
    syncInterval = 0,
    changesUrl = '_changes?filter=default/valid_items&limit=1000&since=',
    syncing = false;
    
function getChanges(mesh, connector, callback) {
    var maxSeq = 0;
    
    // check for changes
    mesh.settingRead('couch', 'lastChangeId', function(lastChangeId) {
        console.log('getting: ' + changesUrl + (lastChangeId || 0));
        
        /*
        connector.get(changesUrl + (lastChangeId || 0), function(error, res) {
            if (res.results && res.results.length > 0) {
                mesh.log('found ' + res.results.length + ' changes since change ' + lastChangeId);
                
                res.results.forEach(function(item) {
                    mesh.log('received update for item id: ' + item.id + ', seq: ' + item.seq);
                    connector.emit('update', item);

                    maxSeq = Math.max(maxSeq, item.seq);
                });
                
                // update the last change id
                mesh.settingWrite('couch', 'lastChangeId', maxSeq); 
            } // if
            
            // fire the callback
            callback();
        });
        */
    });
} // getChanges

function runStartupChecks(mesh, connector, connectRes, callback) {
    // write the instance start time
    mesh.settingRead('couch', 'instance_start_time', function(instanceStartTime) {
        if (instanceStartTime === connectRes.instance_start_time) {
            mesh.settingRead('couch', 'lastChangeId', function(lastChangeId) {
                if (lastChangeId > connectRes.update_seq) {
                    connector.emit('reset');
                }
                else {
                    mesh.inSync = lastChangeId === connectRes.update_seq;
                    if (callback) {
                        callback();
                    } // if
                } // if..else
            });
        }
        else {
            mesh.settingWrite('couch', 'instance_start_time', connectRes.instance_start_time);
            connector.emit('reset');
        } // if..else
    });
} // runStartupChecks

function sync(mesh, connector) {
    // if we are in the middle of a synchronization process, then skip this one
    if (syncing) {
        return;
    } // if
    
    mesh.out('synchronizing');
    
    // flag as synchronizing
    syncing = true;
    
    // trigger the synchronization actions
    async.forEach(
        [getChanges], 
        function(fn, itemCallback) {
            fn.call(null, mesh, connector, itemCallback);
        },
        function() {
            syncing = false;
        }
    );
} // sync

exports.init = function(mesh, config) {
    var connector = require('./connector').init(mesh, config);
    
    // on successful connection, run the startup checks
    connector.on('ok', function(res) {
        runStartupChecks(mesh, connector, res, function() {
            // clear the current sync interval
            clearInterval(syncInterval);

            // run the sync process to sync steelmesh with the couch data
            sync(mesh, connector);
            
            // set the sync to run every as per the configuration
            syncInterval = setInterval(function() {
                sync(mesh, connector);
            }, mesh.config.syncInterval || 5000);
        });
    });
    
    // pass on the connector
    return connector;
};
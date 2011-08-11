var url = require('url'),
    replicationActive = false;

function run(stack) {
    if ((! stack.isMaster()) && stack.masterHost) {
        if (stack.couch && !replicationActive) {
            replicationActive = true;
            
            stack.couch.server({
                action: '_replicate',
                source: 'http://' + stack.masterHost + '/json/' + stack.config.couchdb_name,
                target: stack.config.couchdb_name
            }, function(res) {
                if (res.error) {
                    stack.log('replication error from ' + stack.masterHost + ': ' + res.error, 'ERROR');
                } // if
                else if (res.ok && !res.no_changes) {
                    stack.log('replication session ' + res.session_id + ' complete');
                    
                    stack.settingRead('couch', 'lastChangeId', function(lastChangeId) {
                        if (lastChangeId > res.source_last_seq) {
                            stack.log('CouchDB reset detected, resetting lastChangeId setting');
                            stack.settingWrite('couch', 'lastChangeId', 0);
                            stack.inSync = false;
                        } // if
                    });
                } // if
                
                replicationActive = false;
            });
        } // if
    } // if..else
};

module.exports = {
    pattern: '*/5 * * * * *',
    title: 'Master > Slave Synchronization',
    run: run
};
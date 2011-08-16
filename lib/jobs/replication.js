var url = require('url'),
    replicationActive = false;

function run(stack) {
    if ((! stack.isMaster()) && stack.masterHost) {
        if (stack.couch && !replicationActive) {
            replicationActive = true;
            
            var urlParts = url.parse(stack.config.couchdb_url),
                masterUrl = url.format({
                    protocol: urlParts.protocol,
                    hostname: stack.masterHost,
                    port: urlParts.port,
                    pathname: '/' + stack.config.couchdb_db
                });
            
            stack.couch.post({
                action: '_replicate',
                source: masterUrl,
                target: stack.config.couchdb_db,
                filter: 'default/valid_items'
            }, function(error, res) {
                if (error) {
                    stack.log('replication error from ' + stack.masterHost + ': ' + error, 'ERROR');
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
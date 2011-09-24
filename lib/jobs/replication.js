var url = require('url'),
    replicationActive = false;

function run(mesh) {
    if (mesh.isSlave() && mesh.masterHost) {
        if (mesh.couch && !replicationActive) {
            replicationActive = true;
            
            var urlParts = url.parse(mesh.config.couchdb_url),
                masterUrl = url.format({
                    protocol: urlParts.protocol,
                    hostname: mesh.masterHost,
                    port: urlParts.port,
                    pathname: '/' + mesh.config.couchdb_db
                });
            
            mesh.couch.post({
                action: '_replicate',
                source: masterUrl,
                target: mesh.config.couchdb_db,
                filter: 'default/valid_items'
            }, function(error, res) {
                if (error) {
                    mesh.log('replication error from ' + mesh.masterHost + ': ' + error, 'ERROR');
                } // if
                else if (res.ok && !res.no_changes) {
                    mesh.log('replication session ' + res.session_id + ' complete');
                    
                    mesh.settingRead('couch', 'lastChangeId', function(lastChangeId) {
                        if (lastChangeId > res.source_last_seq) {
                            mesh.log('CouchDB reset detected, resetting lastChangeId setting');
                            mesh.settingWrite('couch', 'lastChangeId', 0);
                            mesh.inSync = false;
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
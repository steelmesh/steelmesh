function run(stack) {
    if (! stack.couch) {
        return;
    } // if
    
    function handleCouchUpdate(res) {
        if (res.error) {
            return;
        } // if
        
        var lastId;
        
        // trigger events for the item updates
        for (var ii = 0; ii < res.results.length; ii++) {
            stack.emit('itemUpdate', res.results[ii]);
            
            // update the last id
            lastId = res.results[ii].seq;
        } // for

        // write the last change id
        if (lastId) {
            stack.settingWrite('couch', 'lastChangeId', lastId);
        } // if
    } // handleCouchUpdate
    
    stack.settingRead('couch', 'lastChangeId', function(lastChangeId) {
        stack.couch.queryDB({ 
            db: stack.config.couchdb_name,
            action: '_changes',
            args: {
                since: lastChangeId || 0,
                limit: 100
            }
        }, handleCouchUpdate);
    });
};

module.exports = {
    pattern: '*/5 * * * * *',
    title: 'CouchDB Update Listener',
    run: run
};
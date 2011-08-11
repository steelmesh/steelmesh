function run(stack) {
    if (! stack.couch) {
        return;
    } // if
    
    function handleCouchUpdate(res) {
        if (res.error) {
            return;
        } // if
        
        if (res.results.length > 0) {
            stack.settingWrite('couch', 'lastChangeId', res.results[res.results.length - 1].seq);
        } // if
        
        // trigger events for the item updates
        for (var ii = 0; ii < res.results.length; ii++) {
            stack.emit('itemUpdate', res.results[ii]);
        } // for
        
        stack.log('triggered update for ' + res.results.length + ' items');
    } // handleCouchUpdate
    
    stack.settingRead('couch', 'lastChangeId', function(lastChangeId) {
        stack.couch.queryDB({ 
            db: stack.config.couchdb_name,
            action: '_changes',
            args: {
                since: lastChangeId || 0,
                limit: 1000
            }
        }, handleCouchUpdate);
    });
};

module.exports = {
    pattern: '*/5 * * * * *',
    title: 'CouchDB Update Listener',
    run: run
};
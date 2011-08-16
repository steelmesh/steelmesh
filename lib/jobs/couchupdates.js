function run(stack) {
    if (! stack.couch) {
        return;
    } // if
    
    function handleCouchUpdate(error, res) {
        if (error) {
            return;
        } // if
        
        if (res.results.length > 0) {
            stack.settingWrite('couch', 'lastChangeId', res.results[res.results.length - 1].seq);

            // trigger events for the item updates
            for (var ii = 0; ii < res.results.length; ii++) {
                stack.emit('itemUpdate', res.results[ii]);
            } // for

            stack.log('triggered update for ' + res.results.length + ' items');
        } // if
    } // handleCouchUpdate
    
    // check for changes
    stack.settingRead('couch', 'lastChangeId', function(lastChangeId) {
        stack.couch.get('_changes?since=' + (lastChangeId || 0) + '&limit=1000', handleCouchUpdate);
    });
};

module.exports = {
    pattern: '*/5 * * * * *',
    title: 'CouchDB Update Listener',
    run: run
};
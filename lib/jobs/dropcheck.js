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

            // trigger events for the item updates
            for (var ii = 0; ii < res.results.length; ii++) {
                stack.emit('itemUpdate', res.results[ii]);
            } // for

            stack.log('triggered update for ' + res.results.length + ' items');
        } // if
    } // handleCouchUpdate
    
    stack.couch.queryDB({ db: stack.config.couchdb_name }, function(res) {
        if (res.error) {
            return;
        } // if
        
        // check for changes
        stack.settingRead('couch', 'instance_start_time', function(instanceStartTime) {
            if (instanceStartTime !== res.instance_start_time) {
                stack.log('CouchDB database reset detected, restarting nodeSTACK');
                stack.restart();
            } // if
        }, true);
    });
};

module.exports = {
    pattern: '*/30 * * * * *',
    title: 'CouchDB Database Drop Check',
    run: run
};
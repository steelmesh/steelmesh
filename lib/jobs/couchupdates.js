var processing = false;

function processUpdates(stack, items, callback) {
    // trigger events for the item updates
    for (var ii = 0; ii < items.length; ii++) {
        stack.emit('itemUpdate', items[ii]);
    } // for

    stack.log('triggered update for ' + items.length + ' items');
    callback(items[items.length - 1].seq);
} // processUpdates

function run(stack) {
    if (processing || (! stack.couch)) {
        return;
    } // if
    
    // check for changes
    stack.settingRead('couch', 'lastChangeId', function(lastChangeId) {
        stack.couch.get('_changes?since=' + (lastChangeId || 0) + '&limit=1000', function(error, res) {
            if (res.results && res.results.length > 0) {
                processing = true;

                processUpdates(stack, res.results, function(itemId) {
                    if (itemId) {
                        stack.settingWrite('couch', 'lastChangeId', itemId); 
                    } // if
                    
                    processing = false;
                });
            } // if
        });
    });
};

module.exports = {
    pattern: '*/5 * * * * *',
    title: 'CouchDB Update Listener',
    run: run
};
var processing = false;

function processUpdates(stack, items, callback) {
    var maxSeq = 0;
    
    // trigger events for the item updates
    for (var ii = 0; ii < items.length; ii++) {
        stack.log('received update for item id: ' + items[ii].id + ', seq: ' + items[ii].seq);
        stack.emit('itemUpdate', items[ii]);
        
        maxSeq = Math.max(maxSeq, items[ii].seq);
    } // for

    callback(maxSeq);
} // processUpdates

function run(stack) {
    if (processing || (! stack.couch)) {
        return;
    } // if
    
    // check for changes
    stack.settingRead('couch', 'lastChangeId', function(lastChangeId) {
        processing = true;
        stack.log('reading changes since change ' + lastChangeId);

        stack.couch.get('_changes?since=' + (lastChangeId || 0) + '&limit=1000', function(error, res) {
            if (res.results && res.results.length > 0) {
                processUpdates(stack, res.results, function(itemId) {
                    if (itemId) {
                        stack.settingWrite('couch', 'lastChangeId', itemId); 
                    } // if
                    
                    processing = false;
                });
            }
            else {
                processing = false;
            }
        });
    });
};

module.exports = {
    pattern: '*/5 * * * * *',
    title: 'CouchDB Update Listener',
    run: run
};
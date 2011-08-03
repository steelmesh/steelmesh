var leveldb = require('node-leveldb'),
    microtime = require('microtime'),
    dgram = require('dgram'),
    commsSocketType = 'unix_dgram',
    delim = '::',
    serverPath = '/tmp/nodestack_changelog',
    db,
    dgramClient,
    dgramServer;
    
function initDB(stack) {
    stack.log('opening change log db');

    db = new leveldb.DB();
    db.open({
        create_if_missing: true
    }, 'db/changelog');
    
    stack.log('attaching port listeners for changes');
    
    dgramServer = dgram.createSocket(commsSocketType);
    dgramServer.on('message', function(msg, rinfo) {
        var msgParts = msg ? msg.toString('utf8').split(delim)  : [];
        
        // if we have the db, then pass this to the write function
        if (db && msgParts.length > 1) {
            exports.write(stack, msgParts[0], msgParts[1]);
        } // if
    });
    
    dgramServer.bind(serverPath);
}
    
exports.init = function(stack) {
    // determine if we are the log writer or not.  this is a little confusing
    // if we are a master process and NOT the warchief, then open the log
    // or if we are a villager on the warchief box - a highlander (there can only be one)
    // then we are also responsible for the changelog
    var dbOwner = stack.masterProcess && (! stack.isWarChief()) || (stack.mode == 'highlander');
    
    // if we are the db owner then open the database and also a port to receive updates on
    if (dbOwner) {
        initDB(stack);
    }
    // otherwise, prepare to ping back updates
    else {
        dgramClient = dgram.createSocket(commsSocketType);
    }
    
    stack.log('changelog initialized. I am ' + (dbOwner ? '' : 'NOT ') + 'the owner.');
};

exports.write = function(stack, entryType, entryData) {
    if (stack && entryType) {
        // initialise the actual data to send to the server
        var realData = typeof entryData == 'string' ? entryData : JSON.stringify(entryData);
        
        // if the real data is undefined, then replace with an empty string
        realData = realData || '';
        
        // if the db exists then put a new entry in the db
        if (db) {
            // create the entry key
            entryKey = microtime.now().toString();
            
            // ensure that the entry key is left-padded with 0s to 20 characters long
            // this will ensure that entry added at time 1 is stored in the leveldb before time 123
            entryKey = (new Array(20 - entryKey.length).join('0') + 1) + entryKey;
            
            // add the additional entry key details
            entryKey += delim + stack.id + delim + entryType;
            
            // add to the db
            db.put({}, new Buffer(entryKey), new Buffer(realData));
            
            stack.log('wrote to change "' + entryKey + '" to the changelog db');
        }
        else if (dgramClient) {
            var message = new Buffer(entryType + delim + realData);
            dgramClient.send(message, 0, message.length, serverPath);
        } // if..else
    } // if
};

exports.shutdown = function(stack) {
    if (db) {
        stack.log('closing changelog db');
        db.close();
    } // if
}; // shutdown
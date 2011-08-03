var leveldb = require('node-leveldb'),
    iterator;

db = new leveldb.DB();
db.open({
    create_if_missing: true
}, 'db/changelog');

iterator = db.newIterator({});

console.log(iterator.valid());

for (iterator.seekToFirst(); iterator.valid(); iterator.next()) {
    console.log(iterator.key().toString());
} // for
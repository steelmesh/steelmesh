var cradle = require('cradle'),
    stack = require('../app'),
    conn,
    db;
    
console.log(stack.config);

conn = new cradle.Connection(stack.config.couchdb);

console.log(conn.databases());

db = conn.database('test');
db.create();

db.save('vader', {
    name: 'darth', 
    force: 'dark'
}, function (err, res) {
    console.log(err);
    console.log(res);
});
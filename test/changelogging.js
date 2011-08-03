var stack = require('../lib/stack').configure(),
    uuid = require('node-uuid'),
    logCount = 1000;

// initialise the stack
stack.init();

// write some change logs
for (var ii = 0; ii < logCount; ii++) {
    stack.sendChange('test', uuid());
} // for
var warchief = require('../warchief');

function run(stack) {
    if (stack.isWarChief()) {
        stack.log('I AM THE WARCHIEF!!!');
    }
    else if (stack.warchiefHost) {
        stack.log('looking for the chief: ' + stack.warchiefHost);
        
        // sync with the warchief
        warchief.sync(stack, stack.warchiefHost, function(data) {
            console.log(data);
        });
    } // if..else
};

module.exports = {
    pattern: '*/30 * * * * *',
    title: 'WarChief Synchronization',
    run: run
};
function run(stack) {
    if (stack.isMaster()) {
        stack.log('I AM THE MASTER !!!');
    }
    else if (stack.masterHost) {
        stack.log('looking for the master: ' + stack.masterHost);
    } // if..else
};

module.exports = {
    pattern: '*/30 * * * * *',
    title: 'WarChief Synchronization',
    run: run
};
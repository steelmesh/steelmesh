function run(stack) {
    if (stack.isWarChief()) {
        stack.log('I AM THE WARCHIEF!!!');
    }
    else {
        stack.log('looking for the chief');
    } // if..else
};

module.exports = {
    pattern: '*/30 * * * * *',
    title: 'WarChief Synchronization',
    run: run
};
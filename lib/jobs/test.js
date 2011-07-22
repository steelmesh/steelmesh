function run(stack) {
    stack.log('running test job');
};

module.exports = {
    pattern: '*/30 * * * * *',
    title: 'Test Job',
    run: run
};
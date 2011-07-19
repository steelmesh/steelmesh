module.exports = function() {
    var startTick = new Date().getTime(),
        lastTick = startTick,
        data = [];
        
    /* exports */
    
    function checkpoint(text) {
        var checkTick = new Date().getTime();

        // add the data
        data.push({
            message: text,
            total: checkTick - startTick,
            last: checkTick - lastTick
        });

        // update the last tick
        lastTick = checkTick;
    } // checkpoint

    function getData() {
        var messages = [],
            total = 0;

        data.forEach(function(entry) {
            messages[messages.length] = entry.message + ' (' + entry.last + '/' + entry.total + ')';
            total += entry.last;
        });

        return {
            execTime: total,
            messages: messages
        };
    } // getData
    
    return {
        checkpoint: checkpoint,
        getData: getData
    };
};


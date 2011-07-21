var fs = require('fs'),
    path = require('path');

exports.run = function(stack) {
    stack.log('loading jobs');
    fs.readdir(stack.config.pathJobs, function(err, files) {
        if (! err) {
            files.forEach(function(jobFile) {
                stack.registerJob(require(path.join(stack.config.pathJobs, jobFile)));
            });
        } // if
    });
    
    // iterate through the jobs directory and load the jobs
    
    // console.log(require('util').inspect(stack.cluster));
};
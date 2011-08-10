(function() {
    
    function init() {
        $.ajax({
            url: '/_stack/dash/status',
            dataType: 'json',
            success: function(data) {
                var systems = $('.system');
                
                console.log(data);
                
                systems.parent().show();
                weld(systems[0], data.connectors, {
                    map: function(parent, el, k, v) {
                        if (k === 'status') {
                            $(el).addClass(v);
                        }
                    }
                });
            }
        });
        
        $.ajax({
            url: '/_jobdata.json',
            dataType: 'json',
            cache: false,
            success: function(data) {
                var jobs = $('.job');
                
                if (data.jobs.length > 0) {
                    jobs.parent().show();
                    weld(jobs[0], data.jobs);
                } // if
            }
        });
        
        $.ajax({
            url: '/_stack/dash/datasets',
            dataType: 'json',
            success: function(data) {
                var datasets = $('.dataset');
                datasets.parent().show();
                
                weld(datasets[0], data.datasets);
            }
        });
    } // init
    
    $(document).ready(init);
})();
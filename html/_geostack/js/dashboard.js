(function() {
    
    function init() {
        $.ajax({
            url: '/dash/status',
            dataType: 'json',
            success: function(data) {
                var statuses = $('ul.dash-status');
                
                statuses.show();
                weld(statuses[0], data.systems, {
                    map: function(parent, el, k, v) {
                        if (k === 'status') {
                            $(el).addClass(v);
                        } // if
                    }
                });
            }
        });
    } // init
    
    $(document).ready(init);
})();
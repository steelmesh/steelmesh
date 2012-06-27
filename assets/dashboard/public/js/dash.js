SteelmeshDash = (function() {
    var _templates = {};
    
    function _dashAction(targetUrl, callback) {
        $.ajax({
            url: targetUrl,
            dataType: 'json',
            success: function(data) {
                (data.messages || []).forEach(function(message) {
                    _showMessage(message);
                });
                
                if (callback) {
                    callback(data);
                }
            }
        });
    } // _dashAction
    
    function _deployPackage() {
        var anchor = $(this),
            targetUrl = '/deploy/' + anchor.data('package') + '?version=' + anchor.data('version'),
            spinner;
            
        if (anchor.hasClass('disabled')) {
            return;
        } 
        
        // create the spinner
        spinner = _spin('Deploying package');

        $('.sm-packages a').addClass('disabled');
        _dashAction(targetUrl, function(data) {
            spinner.stop();
            $('.sm-packages a').removeClass('disabled');
        });
    } // _deployPackage
    
    function _loadTemplate(target) {
        var $target = $(target),
            templateId = $target.data('template') || (target + '-template'),
            templateText = $(templateId)[0].innerText
                .replace(/\{\[/g, '{{')
                .replace(/\]\}/g, '}}');
        
        return _templates[target] = Handlebars.compile(templateText);
    } // _loadTemplate
    
    function _showMessage(msg, timeout) {
        if (! msg) { return; }
        
        // add the message
        var msgDiv = 
            $('#status')
                .append(
                    '<div class="label label-' + (msg.type || '') + '" data-alert="true">' + 
                    '<a class="close" href="#">×</a>' + 
                    '<p>' + (msg.text || '') + '</p>' + 
                    '</div>'
                )
                .find('.label:last');
                
        setTimeout(function() {
            msgDiv.fadeOut(function() {
                msgDiv.remove();
            });
        }, timeout || 2000);
    }
    
    function _spin(target, opts) {
        opts = $.extend({
          lines: 10, // The number of lines to draw
          length: 3, // The length of each line
          width: 2, // The line thickness
          radius: 5, // The radius of the inner circle
          color: '#000', // #rgb or #rrggbb
          speed: 1.6, // Rounds per second
          trail: 50, // Afterglow percentage
          shadow: false // Whether to render a shadow
        }, opts);
        
        if (typeof target == 'string') {
            var msgDiv = $('#status')
                    .append('<div class="sm-statustext"><span class="sm-spinner"></span><span>' + target + '</span></div>')
                    .find('.sm-statustext:last'),
                spinner = new Spinner(opts).spin(msgDiv.find('.sm-spinner')[0]);
                
            return {
                stop: function() {
                    spinner.stop();
                    msgDiv.remove();
                }
            };
        }
        else {
            return new Spinner(opts).spin(target);        
        }
        
    }
    
    function _updateStatus() {
        $.ajax({
            url: '/status',
            dataType: 'json',
            success: function(data) {
                var label = $('.sm-server-status'),
                    status = data.status || 'unknown';
                    
                // reset the label classes
                label[0].className = 'sm-server-status label';
                
                // update the text
                label.html(status);
                
                // apply any extra styles
                switch (status) {
                    case 'online': {
                        label.addClass('label-success');
                        break;
                    }
                }
            }
        });
    } // _updateStatus
    
    
    /* exports */
    
    function fill(target) {
        // find the target
        var $target = $(target),
            template = _templates[target];
            
        // if we don't have a compiled template, do that now
        if (! template) {
            template = _loadTemplate(target);
        }
        
        $.ajax({
            url: $target.data('url'),
            success: function(data) {
                $target.html(template(data));
                $target.show();
            }
        });
    };
    
    function monitorServerStatus(callback) {
        $.ajax({
            url: '/up',
            dataType: 'json',
            success: function(data) {
                if (callback) {
                    callback(data.server);
                    
                    setTimeout(function() {
                        monitorServerStatus(callback);
                    }, 5000);
                }
            }
        });
    }
    
    $('.sm-packages a').click(_deployPackage);
    setInterval(_updateStatus, 500);
    
    $().alert();
    $('.dropdown-toggle').dropdown();

    return {
        fill: fill,
        monitorServerStatus: monitorServerStatus
    };
})();
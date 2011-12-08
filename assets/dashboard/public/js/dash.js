SteelmeshDash = (function() {
    var reException = /\$\{exception\:(\d+)\}/,
        exceptionBox,
        logFormatters = {
            access: function(lines) {
                var output = '';
                
                for (var ii = 0, lineCount = lines.length; ii < lineCount; ii++) {
                    output += '<tr><td>' + lines[ii] + '</td></tr>';
                }
            
                return output;
            },
        
            events: function(lines) {
                var output = '';
            
                for (var ii = 0, lineCount = lines.length; ii < lineCount; ii++) {
                    if (lines[ii]) {
                        var fields = lines[ii].split(' '),
                            message = fields.slice(4).join(' '),
                            exceptionMatch = reException.exec(message);

                        // replace exceptions with relevant html
                        while (exceptionMatch) {
                            message = message.slice(0, exceptionMatch.index) + 
                                '<span class="sm-exception label important" href="#">' + exceptionMatch[1] + '</span>' +
                                message.slice(exceptionMatch.index + exceptionMatch[0].length);
                                
                            exceptionMatch = reException.exec(message);
                        }
                    
                        output += 
                            '<tr>' + 
                                '<td>' + fields[0] + '</td>' + 
                                '<td>' + fields[1] + '</td>' + 
                                '<td>' + fields[2] + '</td>' + 
                                '<td>' + fields[3] + '</td>' + 
                                '<td>' + message +
                            '</tr>';
                        
                        /*
                        output.push({
                            time: new Date(fields[0]),
                            pid: parseInt(fields[1], 10),
                            lvl: fields[2],
                            src: fields[3],
                            msg: fields.slice(4).join(' ')
                        });
                        */
                    }
                }

                return output;
            }
        };
    
    function _changeLog(targetLog) {
        $.ajax({
            url: '/log/' + targetLog,
            dataType: 'json',
            success: function(data) {
                var formatter = logFormatters[data.type],
                    logLines = $('#loglines');
                    
                if (! exceptionBox) {
                    exceptionBox = $('#exception-details');
                    exceptionBox.modal({ keyboard: true, show: false });
                }
                    
                if (formatter) {
                    logLines.html(formatter(data.lines));
                    $('.sm-exception', logLines).on('click', function() {
                        $.ajax({
                            url: '/exception/' + $(this).text(),
                            dataType: 'json',
                            success: function(data) {
                                if (data.stack) {
                                    $('h3', exceptionBox).html(data.message || '');
                                    $('.modal-body', exceptionBox).html('<pre>' + data.stack + '</pre>');
                                }
                                else if (data.err) {
                                    $('h3', exceptionBox).html('Could not load exception details');
                                    $('.modal-body', exceptionBox).html('<pre>' + data.err + '</pre>');
                                }
                                    
                                exceptionBox.modal('show');
                            }
                        });
                    });
                    
                }
            }
        });
    } // _changeLog
    
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
    
    function _showMessage(msg, timeout) {
        if (! msg) { return; }
        
        // add the message
        var msgDiv = 
            $('#status')
                .append(
                    '<div class="alert-message ' + (msg.type || '') + '" data-alert="true">' + 
                    '<a class="close" href="#">×</a>' + 
                    '<p>' + (msg.text || '') + '</p>' + 
                    '</div>'
                )
                .find('.alert-message:last');
                
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
                        label.addClass('success');
                        break;
                    }
                }
            }
        });
    } // _updateStatus
    
    
    /* exports */
    
    function monitorServerStatus(callback) {
        setInterval(function() {
            $.ajax({
                url: '/up',
                dataType: 'json',
                success: function(data) {
                    if (callback) {
                        callback(data.server);
                    }
                }
            });
        }, 500);
    }
    
    $('a.log').click(function() {
        $('.pills li').removeClass('active');
        $(this).parent().addClass('active');
        
        _changeLog($(this).text());
    });
    
    $('.sm-packages a').click(_deployPackage);
    setInterval(_updateStatus, 500);
    
    $().alert();
    $('.topbar').dropdown();
    
    return {
        monitorServerStatus: monitorServerStatus
    };
})();
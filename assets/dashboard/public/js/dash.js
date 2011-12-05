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
    
    $('a.log').click(function() {
        $('.pills li').removeClass('active');
        $(this).parent().addClass('active');
        
        _changeLog($(this).text());
    });
    
    $().alert();
})();
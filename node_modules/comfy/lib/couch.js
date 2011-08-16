// Copyright (c) 2011 Damon Oehlman
// Permission is hereby granted, free of charge, to any person obtaining a copy of this 
// software and associated documentation files (the "Software"), to deal in the Software 
// without restriction, including without limitation the rights to use, copy, modify, merge, 
// publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons
// to whom the Software is furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included in all copies or 
// substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING 
// BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND 
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, 
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

var request = require('request'),
    reStatusOK = /^2\d{2}$/,
    reServerLevelUrl = /^\_(uuids|stats|replicate)/i,
    reContinuous = /feed\=continuous/i,
    reControlKey = /^(db|action)$/,
    reTrailingSlash = /\/$/;

function Couch(config) {
    var couch = this;
    
    // if no configuration was passed, then initialise an empty object literal
    config = config || {};

    // initialise members
    this.url = (config.url || 'http://localhost:5984/').replace(reTrailingSlash, '');
    this.db  = config.db;
    this.debug = config.debug;
    this.safety = typeof config.safety != 'undefined' ? config.safety : true;
    
    ['get', 'post', 'put', 'head', 'del'].forEach(function(method) {
        couch[method] = function(target, callback) {
            if (typeof target == 'function') {
                callback = target;
                target = {};
            } // if
            
            // if the target has been passed in as a string, then convert that to an action
            if (typeof target == 'string') {
                target = {
                    action: target
                };
            } // if
            
            // initialise target to default
            target = target || {};
            
            // prepare the request
            couch._prepareRequest(target, method.toUpperCase(), function(error, requestOpts) {
                if (! error) {
                    if (couch.debug) {
                        console.log(method, requestOpts);
                    } // if

                    request[method](requestOpts, couch._processResponse(requestOpts.onResponse, callback));
                }
                else if (callback) {
                    callback(error);
                } // if..else
            });
        };
    });
} // Couch

Couch.prototype._checkDocData = function(data, callback) {
    if (! callback) {
        return;
    } // if
    
    if (! data._id) {
        this.get('_uuids', function(error, res) {
            callback(res.uuids[0], data);
        });
    }
    else {
        callback(data._id, data);
    } // if..else
}; // checkDocData

Couch.prototype._prepareRequest = function(target, method, callback) {
    
    var urlParts = [this.url],
        requestOpts = {},
        targetUrl = target.action || target._id,
        targetDb = target.db || this.db,
        targetData = {},
        isDoc = false;
        
    // if a database is currently specified, then add to the url
    if (targetDb && (! reServerLevelUrl.test(targetUrl))) {
        urlParts.push(targetDb);
    } // if
    
    // if we are in safety mode, then check a few things
    if (this.safety) {
        if (! this._safetyCheck(target, method, callback)) {
            return;
        } // if
    } // if

    // initialise the target data
    for (var key in target) {
        if (! reControlKey.test(key)) {
            targetData[key] = target[key];
            isDoc = true;
        } // if
    } // for

    // if we have target information (which isn't provided in the case of a DB op)
    // and the method is a PUT, then check that we have an id
    if (isDoc && method === 'PUT') {
        this._checkDocData(target, function(id, data) {
            urlParts.push(id);

            callback(null, {
                uri: urlParts.join('/'),
                json: targetData
            });
        });
    }
    else {
        if (targetUrl) {
            urlParts.push(targetUrl);
        } // if
        
        callback(null, {
            uri: urlParts.join('/'),
            json: method !== 'GET' ? targetData : undefined,
            onResponse: reContinuous.test(targetUrl)
        });
    } // if..else
}; // makeOpts

Couch.prototype._processResponse = function(stream, callback) {
    function parseResponse(error, resp, body) {
        var processed,
            statusOK = resp && reStatusOK.test(resp.statusCode);

        if (! error) {
            try {
                processed = typeof body == 'object' ? body : JSON.parse(body);
            }
            catch (e) {
                processed = body;
            } // try..catch
        } // if

        if (callback) {
            if (! statusOK) {
                error = error || 'failed_' + (resp || {}).statusCode;
            } // if
            
            callback(error || (processed || {}).error, processed);
        } // if
    } // parseResponse

    if (stream) {
        return function(error, resp, body) {
            if (error) {
                return;
            } // if
            
            // process the streamed data
            resp.on('data', function(data) {
                parseResponse(error, resp, data.toString());
            });
        };
    }
    else {
        return parseResponse;
    } // if..else
}; // _parseResponse

Couch.prototype._safetyCheck = function(target, method, callback) {
    var checksPass = true;
    
    if (method === 'DEL' && (! target.db)) {
        callback('Safety First! Specify db when executing a delete operation.');
        checksPass = false;
    } // if
    
    return checksPass;
}; // _safetyCheck

/* some high level helpers */

Couch.prototype.exists = function(target, callback) {
    if (typeof target == 'function') {
        callback = target;
        target = {};
    } // if
        
    this.get(target, function(error, res) {
        callback(! error, res);
    });
}; // exists

Couch.prototype.getFirst = function(targets, callback) {
    var targetIdx = 0,
        couch = this;
    
    function getNext() {
        if (targetIdx < targets.length) {
            couch.get(targets[targetIdx++], function(error, res) {
                if (! error) {
                    callback(error, res);
                }
                else {
                    getNext();
                } // if..else
            });
        } // if
    } // getNext
    
    getNext();
}; // getFirst

module.exports = Couch;
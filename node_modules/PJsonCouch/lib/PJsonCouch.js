//
// Copyright (c) Pedro Landeiro <landeiro@gmail.com>, All rights reserved.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.
var http = require("http");

var methods = [];
methods["_all_docs"] = "GET";
methods["_changes"] = "GET";
methods["_compact"] = "POST";
methods["_view_cleanup"] = "POST";
methods["_ensure_full_commit"] = "POST";
methods["_security"] = "GET";
methods["_revs_limit"] = "GET";
methods["_active_tasks"] = "GET";
methods["_all_dbs"] = "GET";
methods["_log"] = "GET";
methods["_replicate"] = "POST";
methods["_restart"] = "POST";
methods["_stats"] = "GET";
methods["_uuids"] = "GET";
methods["_info"] = "GET";

var methodsWithRequest = [];
methodsWithRequest["_security"] = "PUT";
methodsWithRequest["_all_docs"] = "POST";
methodsWithRequest["_revs_limit"] = "PUT";
methodsWithRequest["_purge"] = "POST";
methodsWithRequest["_missing_revs"] = "POST";
methodsWithRequest["_revs_diff"] = "POST";
methodsWithRequest["_temp_view"] = "POST";
methodsWithRequest["_replicate"] = "POST";

var Utils = {
  clone: function (obj) {
    var target = {};
    for (var i in obj) {
      if (obj.hasOwnProperty(i)) {
        target[i] = obj[i];
      }
    }
    return target;

  },
  
  smartQueryStringAux: function (value) {
    return (typeof value === "string") ? '"' + encodeURIComponent(value) + '"' : encodeURIComponent(value);
  },
  
  smartQueryString: function (query) {
    if (query === "") return "";
    var qstring = "";
    for (key in query) {
      if (qstring !== "") {
        qstring += "&";
      }
      if (query[key] && query[key].length > 0 && (typeof query[key] !== "string")) {
        qstring += key + '=[';
        for (keyArray in query[key]) {
          if (qstring.charAt(qstring.length - 1) !== '[') {
            qstring += ',';
          }
          qstring += Utils.smartQueryStringAux(query[key][keyArray]);
        }
        qstring += ']';
      } else if (typeof query[key] === "string" && key.search(/key/gi) !== -1) {
        qstring += key + '=' + Utils.smartQueryStringAux(query[key]);
      } else {
        qstring += key + '=' + encodeURIComponent(query[key]);
      }
    }
    return qstring;
  },
  
  decodeGetDataAux: function (content, qstring, bool) {
    if (!bool) {
      return (content === undefined ? "" : qstring + content);
    } else {
      return (content !== true ? "" : qstring);
    }
  },
  
  decodeGetData: function (url) {
    var qstring = "";

    if (url.serverAction) {
      qstring += (Utils.decodeGetDataAux(url.serverAction, "/"));
      return qstring;
    }
    qstring += (Utils.decodeGetDataAux(url.db, "/"));
    qstring += (Utils.decodeGetDataAux(url.local, "/_local", true));
    qstring += (Utils.decodeGetDataAux(url.design, "/_design/"));
    qstring += (Utils.decodeGetDataAux(url.show, "/_show/"));
    qstring += (Utils.decodeGetDataAux(url.list, "/_list/"));
    (qstring.indexOf("/_list/") !== -1) ? qstring += (Utils.decodeGetDataAux(url.view, "/")) : qstring += (Utils.decodeGetDataAux(url.view, "/_view/"));
    qstring += (Utils.decodeGetDataAux(url.action, "/"));
    qstring += (Utils.decodeGetDataAux(url.id, "/"));
    qstring += (Utils.decodeGetDataAux(url.attachment, "/"));

    return qstring;
  },
  
  setJSONError: function (option, result) {
    return {
      content_type: option.content_type,
      length: option.content_length,
      not_json: result
    };
  },
  
  insertExtraInfo: function (result, data, option, resOptions, config) {
    try {
      result = JSON.parse(result);
    } catch (err) {
      result = Utils.setJSONError(option, result);
    };
    if (typeof result !== "object") result = Utils.setJSONError(option, result);

    if (config.debug || (result.error && config.debugOnError)) {
      result.debug = {};

      if (data) {
        result.debug.content = data;
      }

      if (result.error && config.throwExceptionsOnError) {
        throw new Error("{PJsonCouch Exception:" + JSON.stringify(result) + "}");
      }
      result.debug.request = option;

      if (config.debugWithHeaders && resOptions) {
        result.debug.resultHeaders = resOptions.headers;
      }
    }

    if (option.requireHeaders && resOptions) {
      result.headers = resOptions.headers;
    }
    return result;
  },
  
  request: function (reqOptions, data, reqConfig, callBackFunction) {
    var result = "";
    data = data || "";
    var req = http.request(reqOptions, function (res) {
      (reqOptions.resultEncoding) ? res.setEncoding(reqOptions.resultEncoding) : res.setEncoding('utf8');
      res.on('data', function (chunk) {
        result += chunk;
      });
      res.on('end', function () {
        if (reqOptions.method === "HEAD") {
          callBackFunction(Utils.insertExtraInfo(JSON.stringify(res.headers), {}, reqOptions, res, reqConfig));
        } else {
          if (res.headers["Content-Type"] !== "application/json") {
            reqOptions.content_type = res.headers["content-type"];
            reqOptions.content_length = res.headers["content-length"];
          }
          callBackFunction(Utils.insertExtraInfo(result, data, reqOptions, res, reqConfig));
        }
      });
      res.on('error', function (err) {
        callBackFunction(Utils.insertExtraInfo(JSON.stringify({
          error: 'response_from_couchdb',
          detail: err
        }), data, reqOptions, false, reqConfig));
      });
    }).on('error', function (err) {
      callBackFunction(Utils.insertExtraInfo(JSON.stringify({
        error: 'request_to_couchdb',
        detail: err
      }), data, reqOptions, false, reqConfig));
    });
    if (reqOptions.method === "PUT" || reqOptions.method === "POST") {
      req.write(data, ((reqOptions.requestEncoding) ? reqOptions.requestEncoding : 'utf8'));
    }
    req.end();
  }
};


var PJsonCouch = function (options) {

    if (this instanceof PJsonCouch) {

      this.setDB = function (dbObj) {
        myDB = dbObj.db;
      };
      
      this.getDB = function () {
        return {
          db: myDB
        };
      };
      
      this.getSession = function () {
        return {
          AuthSession: mySession
        };
      };


      var myDB = options.db;
      var mySession = "";

      var config = {
        debug: false,
        debugWithHeaders: false,
        debugOnError: false,
        throwExceptionsOnError: false
      };

      this.setDebugConfig = function (argCfg) {
        for (var argKey in argCfg) {
          if (config.hasOwnProperty(argKey)) config[argKey] = argCfg[argKey];
        }
      };

      this.getDebugConfig = function () {
        return config;
      };

      this.login = function (credentials, callBackFunction) {
        var postOptions = this.buildRequest("POST", {
          serverAction: "_session"
        });
        postOptions.headers = {};
        postOptions.headers["Content-Type"] = "application/x-www-form-urlencoded";
//        postOptions.headers["Referer"] = "http://127.0.0.1";
        var loginWith = "name=" + credentials.user + "&password=" + credentials.password;
        postOptions.requireHeaders = true;
        Utils.request(postOptions, loginWith, config, function (res) {
          if (res && res.headers && res.headers["set-cookie"]) {
            var cookie = res.headers["set-cookie"][0];
            mySession = cookie.split("=")[1].split(";")[0];
          }
          if (callBackFunction) {
            callBackFunction(res);
          }
        });
      };

      this.logout = function (callBackFunction) {
        var reqOptions = this.buildRequest("DELETE", {
          serverAction: "_session"
        });
        Utils.request(reqOptions, "", config, function (logoutResult) {
          if (logoutResult.ok)  {
            mySession = "";
          }
          if (callBackFunction) {
            callBackFunction(logoutResult);
          }
        });
      };

      this.createDB = function (url, callBackFunction) {
        var reqOptions = this.buildRequest("PUT", url);
        Utils.request(reqOptions, "", config, function (dbInfo) {
          if (callBackFunction) {
            callBackFunction(dbInfo);
          }
        });
      };

      this.deleteDB = function (url, callBackFunction) {
        var reqOptions = this.buildRequest("DELETE", url);
        Utils.request(reqOptions, "", config, function (dbInfo) {
          if (callBackFunction) {
            callBackFunction(dbInfo);
          }
        });
      };

      this.queryDB = function (url, callBackFunction) {
        var method = (url.request) ? methodsWithRequest[url.action] : methods[url.action];
        var reqOptions = this.buildRequest(method, url);
        Utils.request(reqOptions, JSON.stringify(url.request), config, function (dbInfo) {
          if (callBackFunction) {
            callBackFunction(dbInfo);
          }
        });
      };

      this.saveDoc = function (url, callBackFunction) {
        var putOptions;
          
        if (typeof url.doc === "string") {
          url.doc = JSON.parse(url.doc);
        }
        if (url.local) {
          url.doc._id = url.doc._id.replace(/_local\//, "");
          url.action = encodeURIComponent(url.doc._id);
          
          putOptions = this.buildRequest("PUT", url);
          Utils.request(putOptions, JSON.stringify(url.doc), config, function (result) {
            if (callBackFunction) {
              callBackFunction(result);
            }
          });
        } else if (url.doc._id) {
          url.action = encodeURIComponent(url.doc._id);
          
          putOptions = this.buildRequest("PUT", url);
          Utils.request(putOptions, JSON.stringify(url.doc), config, function (result) {
            if (callBackFunction) {
              callBackFunction(result);
            }
          });
        } else {
          var that = this;
          this.server({
            action: "_uuids"
          }, function (u) {
            url.action = encodeURIComponent(u.uuids[0]);
            var putOptions = that.buildRequest("PUT", url);
            Utils.request(putOptions, JSON.stringify(url.doc), config, function (result) {
              if (callBackFunction) {
                callBackFunction(result);
              }
            });

          });
        }
      };

      this.saveDocAttachment = function (url, callBackFunction) {
        url.args = {};
        url.args.rev = url.rev;
        if (url.id) {
          url.id = encodeURIComponent(url.id);
        }
        var type = url.attachment.content_type;
        var length = url.attachment.content_length;
        var ifMatch = url.attachment.if_match;
        var content = url.attachment.content;
        var encoding = url.attachment.content_encoding;
        url.attachment = url.attachment.file;
        var putOptions = this.buildRequest("PUT", url);
        putOptions.requestEncoding = encoding;
        putOptions.headers["Content-Type"] = type;
        if (length) {
          putOptions.headers["Content-Length"] = length;
        }
        if (ifMatch) {
          putOptions.headers["If-Match"] = ifMatch;
        }
        Utils.request(putOptions, content, config, function (result) {
          if (callBackFunction) {
            callBackFunction(result);
          }
        });

      };

      this.deleteDocAttachment = function (url, callBackFunction) {
        if (url.rev) {
          url.args = {};
          url.args.rev = url.rev;
        }
        if (url.id) {
          url.id = encodeURIComponent(url.id);
        }
        url.attachment = url.attachment.file;
        var deleteOptions = this.buildRequest("DELETE", url);
        Utils.request(deleteOptions, "", config, function (result) {
          if (callBackFunction) {
            callBackFunction(result);
          }
        });

      };

      this.deleteDoc = function (url, callBackFunction) {
        if (url.local) {
          url.action = encodeURIComponent(url.doc._id);
          url.args = {};
          url.args.rev = url.doc._rev;
        } else {
          url.doc._deleted = true;
        }
        var postdeleteOptions = this.buildRequest((url.local) ? "DELETE" : "POST", url);
        Utils.request(postdeleteOptions, JSON.stringify(url.doc), config, function (result) {
          if (callBackFunction) {
            callBackFunction(result);
          }
        });
      };

      this.getDoc = function (url, callBackFunction) {
        if (url.id) {
          url.id = encodeURIComponent(url.id);
        }
        var getOptions = this.buildRequest("GET", encodeURIComponent(url));
        Utils.request(getOptions, "", config, function (doc) {
          if (callBackFunction) {
            callBackFunction(doc);
          }
        });
      };

      this.getDocAttachment = function (url, callBackFunction) {
        if (url.id) {
          url.id = encodeURIComponent(url.id);
        }
        var encoding = url.attachment.content_encoding;
        url.attachment = url.attachment.file;
        var getOptions = this.buildRequest("GET", url);
        getOptions.resultEncoding = encoding;
        Utils.request(getOptions, "", config, function (doc) {
          if (callBackFunction) callBackFunction(doc);
        });
      };

      this.infoDoc = function (url, callBackFunction) {
        var headOptions = this.buildRequest("HEAD", url);
        Utils.request(headOptions, "", config, function (result) {
          if (callBackFunction) {
            callBackFunction(result);
          }
        });
      };

      this.copyDoc = function (url, callBackFunction) {
        url.source.id = encodeURIComponent(url.source.id);
        url.destination.id = encodeURIComponent(url.destination.id);
        if (url.local) {
          url.source.id = url.source.id.replace(/_local\//, "");
          url.destination.id = "_local/" + url.destination.id;
        }
        url.action = url.source.id;
        if (url.source.rev) {
          url.args = {};
          if (!url.local) {// local does not support revs by url
            url.args.rev = url.source.rev;
          }
        }
        var copyOptions = this.buildRequest("COPY", url);
        copyOptions.headers.destination = url.destination.id + ((url.destination.rev) ? "?rev=" + url.destination.rev : "");
        Utils.request(copyOptions, "", config, function (result) {
          if (callBackFunction) {
            callBackFunction(result);
          }
        });
      };

      this.saveBulkDocs = function (url, callBackFunction) {
        var result = "";
        url.action = '_bulk_docs';
        var postOptions = this.buildRequest("POST", url);
        var extraParams = url.args;
        var docs = {};
      
        docs["docs"] = url.docs;
        for (var idx in url.args) {
          docs[idx] = url.args[idx];
          
        }
        
        docs = JSON.stringify(docs);
        
        Utils.request(postOptions, docs, config, function (result) {
          if (callBackFunction) {
            callBackFunction(result);
          }
        });
      };

      this.server = function (url, callBackFunction) {
        var data = {};
        url.serverAction = url.action;
        for (var idx in url) {
          if (idx !== "action" && idx !== "serverAction") {
            data[idx] = url[idx];
          }
        }
        var serverOptions = this.buildRequest(methods[url.action], url);
        if (serverOptions.method !== "PUT" && serverOptions.method !== "POST") {
          data = "";
        }
        Utils.request(serverOptions, JSON.stringify(data), config, function (result) {
          if (callBackFunction) {
            callBackFunction(result);
          }
        });

      };

      this.infoDesign = function (url, callBackFunction) {
        url.action = "_info";
        var designOptions = this.buildRequest(methods[url.action], url);
        Utils.request(designOptions, "", config, function (result) {
          if (callBackFunction) {
            callBackFunction(result);
          }
        });
      };

      this.queryDesign = function (url, callBackFunction) {
        url.stringifyRequest = true;
        var designOptions = this.buildRequest((url.request) ? "POST" : methods[url.action], url);
        Utils.request(designOptions, JSON.stringify(url.request), config, function (result) {
          if (callBackFunction) {
            callBackFunction(result);
          }
        });
      };

      this.buildRequest = function (method, url) {
        if (!url.db && !url.serverAction) url.db = myDB;
        var qsparams = Utils.smartQueryString(url.args);
        options.path = Utils.decodeGetData(url);
        options.method = method;
        options.path = (qsparams === "") ? options.path : options.path + "?" + qsparams;
        if (method !== "GET") {
          options.headers = {"Content-Type": "application/json"};
        }


        if (mySession !== "") {
          if (options.headers === undefined) {
            options.headers = {};
          }
          options.headers["Cookie"] = "AuthSession=" + mySession;
        }

        options.headers["User-Agent"] = "PJsonCouch (node.js client for CouchDB) https://github.com/landeiro/PJsonCouch  <landeiro@gmail.com>";

        return Utils.clone(options);
      };
    } else {
      return new PJsonCouch(options);
    }
};
    
module.exports = PJsonCouch;
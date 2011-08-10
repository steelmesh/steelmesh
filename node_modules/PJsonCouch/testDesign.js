var PJsonCouch = require("./lib/PJsonCouch.js");
var fs = require("fs");

log = function (desc,json) {
    console.log(desc);
    console.log(json);
}
// connection without database definition
var test = PJsonCouch({protocol:"http",host:"127.0.0.1",port:5984});

// set a DB, this does not have callbackfuntion
test.setDB({db:"thisisatempdb"});

// hello world form couchdb :)
//test.server({}, function(data) {log("hello world form couchdb",data)});

// modify the default debug settings
test.setDebugConfig({
		debug: true,
        debugWithHeaders: true,
        debugOnError:true,
        throwExceptionsOnError: false
    });

// *** THESE TESTS WILL NOT WORK, THEY ARE JUST EXAMPLES

// Get the design doc
test.queryDesign({design:"design_doc"},function (r) {log("*get the design doc*",r);});
// Get info of the design doc
test.infoDesign({design:"design_doc"},function (r) {log("*get info of design doc*",r);});

// ** Examples of Lists, supports all arguments and request data from original couchdb API
// List customers using view by_name
test.queryDesign({design:"design_doc",list:"customers",view:"by_name"},function (r) {log("*get list with view*",r);});
// List customers using view by_name from "Jane" to "Pedro"
test.queryDesign({design:"design_doc",list:"customers",view:"by_name",args:{startkey:"Jane",endkey:"Pedro"}},function (r) {log("*get list with view with args*",r);});
// List customers using view by_name with key "Jane", using request
test.queryDesign({design:"design_doc",list:"customers",view:"by_name",request:{keys:["Jane"]}},function (r) {log("*get list with view with request*",r);})
// List customers using view by_name with keys ["joey","John Doe","Jane"], limited to 2 results
test.queryDesign({design:"design_doc",list:"customers",view:"by_name",args:{limit:2},request:{keys:["joey","John Doe","Jane"]}},function (r) {log("*get list with view with request and args*",r);})

// Display a Doc using Show costumer, supports all arguments from original couchdb API
test.queryDesign({design:"design_doc",show:"customer",id:"3535e007bd9c765de0554c0a4900385b"},function (r) {log("*get show*",r);});


// ** Views, supports all arguments and request data from original couchdb API 
// Getting docs using view by_name with args reduce=false and key="Jane"
test.queryDesign({design:"design_doc",view:"by_name",args:{reduce:false,key:"Jane"}},function (r) {log("*get view with args*",r);});
// Getting docs using view by_name with request keys ["Jane"]
test.queryDesign({design:"design_doc",view:"by_name",request:{keys:["Jane"]}},function (r) {log("*get view with request*",r);});
// Getting docs using view by_name with request keys ["Jane"] and argument limit=1 
test.queryDesign({design:"design_doc",view:"by_name",args:{limit:1},request:{keys:["Jane","joey"]}},function (r) {log("*get view with request and args*",r);});
// Getting docs using view by_type_name with startkey and endkey with array type
test.queryDesign({design:"design_doc",view:"by_type_name",args:{startkey:["customer","Jane"],endkey:["customer","joey"]}},function (r) {log("*get view and args*",r);});



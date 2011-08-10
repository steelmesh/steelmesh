var PJsonCouch = require("./lib/PJsonCouch.js");
var fs = require("fs");

log = function (desc,json) {
	console.log(desc);
	console.log(json);
}
// connection without database definition
var test = PJsonCouch({protocol:"http",host:"127.0.0.1",port:5984});

var testWithDB = PJsonCouch({protocol:"http",host:"127.0.0.1",port:5984,db:"anotherDB"});

// set a DB, this does not have callbackfuntion
test.setDB({db:"thisisatempdb"});
log("My current DB",test.getDB());

// hello world form couchdb :)
//test.server({}, function(data) {log("hello world form couchdb",data)});

// modify the default debug settings
test.setDebugConfig({
	debug: false,
	debugOnError:true,
	debugWithHeaders: true,
	throwExceptionsOnError: false
});

// Run first the testDocs.js for the code bellow to work

// Remove login if your DB is not protected
test.login({user:"landeiro",password:"123"},function(r){

	// Get all docs from DB, supports all args and request data from original couchdb API
	test.queryDB({action:"_all_docs", args:{descending:true,startkey:"objmyid6",endkey:"objmyid2"}}, function(r){log("*queryDB start/endkey*",r);});
	test.queryDB({action:"_all_docs", request:{keys:["objmyid1","objmyid7"]}}, function(r){log("*queryDB keys*",r);}); 
	// Get changes, supports all args from original couchdb API
	test.queryDB({action:"_changes", args:{limit:5}}, function(r){log("*queryDB changes*",r);});
	// Ensure full commit,
	test.queryDB({action:"_ensure_full_commit"},function(r){ log("*queryDB full commit*",r); });
	// Get changes, supports all requests data from original couchdb API 
	test.queryDB({action:"_purge",request:{objmyid1:["1-23202479633c2b380f79507a776743d5"]}},function(r){ log("*queryDB full commit*",r); }); 
	// Get revs limit
	test.queryDB({action:"_revs_limit"},function(r){ log("*queryDB revs limit*",r); });
	// Get security settings for the DB
	test.queryDB({action:"_security"},function(r){ log("*GET queryDB security*",r); });
	// Set security settings for the DB, supports all requests data from original couchdb API
	test.queryDB({action:"_security",request:{readers:{roles:[],names:["landeiro"]}}},function(r){ log("*SET queryDB security*",r); });
	// Executes a temporary view on the DB, supports all requests data from original couchdb API
	test.queryDB({action:"_temp_view",request:{map : "function(doc) { if (doc.a > 6) { emit(null, doc.value); } }"}},function (r) {log("*temp view*",r)});
	// Performs view cleanup
	test.queryDB({action:"_view_cleanup"},function (r) {log("*view cleanup*",r)});
	// Compact the DB
	test.queryDB({action:"_compact"},function (r) {log("*compact BD*",r)});

	// Remove this if your DB is not protected
});

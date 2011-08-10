var PJsonCouch = require("./lib/PJsonCouch.js");

log = function (desc,json) {
	console.log(desc);
	console.log(json);
}

// connection without database definition
var test = PJsonCouch({protocol:"http",host:"127.0.0.1",port:5984});


// modify the default debug settings
test.setDebugConfig({
	debug: false,
	debugOnError:true,
	debugWithHeaders: false,
	throwExceptionsOnError: false
});


// Remove login if your DB is not protected
test.login({user:"landeiro",password:"123"},function(r){

	// Welcome msg from CouchDB
	test.server({},function (r) {log("*welcome msg*",r);});
	// Show active tasks
	test.server({action:"_active_tasks"},function (r) {log("*active tasks*",r);});
	// Start continuos replication database. Replication supports all configuration from original couchdb API
	test.server({action:"_replicate",source:"thisisatempdb",target:"http://somedomain.com/land",continuous:true},function (r) {
		log("*replicate*",r);
		// Cancel continuos replication database, supports all configuration from original couchdb API
		test.server({action:"_replicate",source:"thisisatempdb",target:"http://somedomain.com/land",continuous:true,cancel:true},function (r) {log("*cancel replication*",r);})

	});
	// Show all database in couchdb instance
	test.server({action:"_all_dbs"},function (r) {log("*all bds*",r);});
	// Shows log on the not_json property, supports all args from original couchdb API
	test.server({action:"_log",args:{bytes:2000}},function (r) {log("*log*",r);});
	// Shows stats, supports all args from original couchdb API
	test.server({action:"_stats"},function (r) {log("*stats*",r);});
	// Gets a new uuid, supports all args from original couchdb API
	test.server({action:"_uuids"},function (r) {log("*uuids*",r);});

});

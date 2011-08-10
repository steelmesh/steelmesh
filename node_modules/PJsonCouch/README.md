# PJsonCouch

(PJs-on-Couch) is a [node.js](http://nodejs.org/) client lib for [CouchDB](http://couchdb.apache.org/).

PJsonCouch it means Pure-Json-on-Couch but it should be read PJs-on-Couch :)

## Why.
The main idea is to use as most as possible [JSON](http://www.json.org/) for data transport.

For example the CouchDB URL invocation:
	
	/developers/_design/basic_info/_view/by_name?reduce=false&key="Jane"

translates to:
	
	{db:"developers",design:"basic_info",view:"by_name",args:{reduce:false,key:"Jane"}}

With this method we can send all data necessary to query views in the same structure:

	{db:"developers",design:"basic_info",view:"by_name",args:{reduce:false},request:{keys:["Jane"]}}


## Requirements
Tested on node.js v0.4.7 and CouchDB 1.1.1

PJsonCouch requires knowing the [CouchDB API](http://techzone.couchbase.com/sites/default/files/uploads/all/documentation/couchbase-api.html) and does not intend to overcome the logic behind the original API.

## How is PJsonCouch organized?

PJsonCouch is inspired on the CouchDB HTTP API structure, so is divide in 4 main blocks

* Database Methods.
* Document Methods / Local (non-replicating) Document Methods
* Design Document Methods
* Miscellaneous Methods



## Examples

How to connect to CouchDB without db definition and request a complex query to `_all_docs`

	// Constructor without db definition
	var test = PJsonCouch({protocol:"http",host:"127.0.0.1",port:5984});

	// set a DB, this does not have callbackfuntion
	test.setDB({db:"thisisatempdb"});

	// Login if your DB is protected
	test.login({user:"landeiro",password:"123"},function(r){
		// Get all docs from DB, supports all args and request data from original couchdb API
		test.queryDB({action:"_all_docs", args:{descending:true,startkey:"objmyid6",endkey:"objmyid2"}}, function(r){log("*queryDB start/endkey*",r);});
		test.queryDB({action:"_all_docs", request:{keys:["objmyid1","objmyid7"]}}, function(r){log("*queryDB keys*",r);});
	});


How to connect to CouchDB with db definition and execute some docs operations

	var test = PJsonCouch({protocol:"http",host:"127.0.0.1",port:5984,db:"mydatabase"});
	
	// Docs for test
	var docs = [{_id:"objmyid0",a:0},{_id:"objmyid1",a:1},{_id:"objmyid2",a:3}];
	
	// Save bulk, supports all request data from original couchdb API 
	test.saveBulkDocs({docs:docs},function(r){
		log("insert bulk",r);
			// Get Doc, supports all arguments from original couchdb API 
			test.getDoc({id:"objmyid0"},function (gdoc) {
				log("*get doc*",gdoc)
				if (!gdoc.error) {
					// Delete a Doc, supports all arguments from original couchdb API 
					test.deleteDoc({doc:gdoc}, function (r) { log("*deleted "+gdoc._id+"*",r);});
				}
			});
	});



Some random server operations


	test.server({},function (r) {log("*welcome msg*",r);});
	// Show active tasks
	test.server({action:"_active_tasks"},function (r) {log("*active tasks*",r);});
	// Start continuos replication database. Replication supports all configuration from original couchdb API
	test.server({action:"_replicate",source:"thisisatempdb",target:"http://somedomain.com/land",continuous:true},function (r) {
		log("*replicate*",r);
		// Cancel continuos replication database, supports all configuration from original couchdb API
		test.server({action:"_replicate",source:"thisisatempdb",target:"http://somedomain.com/land",continuous:true,cancel:true},function (r) {log("*cancel 	replication*",r);})

	});
	
	
Some random design doc operations

	// List customers using view by_name from "Jane" to "Pedro"
	test.queryDesign({design:"design_doc",list:"customers",view:"by_name",args:{startkey:"Jane",endkey:"Pedro"}},function (r) {log("*get list with view with args*",r);});
	
	// Display a Doc using Show costumer, supports all arguments from original couchdb API
	test.queryDesign({design:"design_doc",show:"customer",id:"3535e007bd9c765de0554c0a4900385b"},function (r) {log("*get show*",r);});
	
	// Getting docs using view by_name with request keys ["Jane"] and argument limit=1 
	test.queryDesign({design:"design_doc",view:"by_name",args:{limit:1},request:{keys:["Jane","joey"]}},function (r) {log("*get view with request and args*",r);});


### Errors can be configured to return a lot of debug, like request content and headers.
	
Cannot connect do CouchDB
	
	{ error: 'request_to_couchdb',
	  detail: 
	   { stack: 'Error: ECONNREFUSED, Connection refused\n    at Socket._onConnect (net.js:576:18)\n    at IOWatcher.onWritable [as callback] (net.js:165:12)',
	     message: 'ECONNREFUSED, Connection refused',
	     errno: 61,
	     code: 'ECONNREFUSED',
	     syscall: 'connect' },
	  debug: 
	   { content: '""',
	     request: 
	      { protocol: 'http',
	        host: '127.0.0.1',
	        port: 5984,
	        path: '/_log?bytes=2000',
	        method: 'GET',
	        headers: [Object],
	        agent: [Object] } } }
	
Unauthorized

	{ error: 'unauthorized',
	  reason: 'You are not a server admin.',
	  debug: 
	   { content: '""',
	     request: 
	      { protocol: 'http',
	        host: '127.0.0.1',
	        port: 5984,
	        path: '/_active_tasks',
	        method: 'GET',
	        headers: [Object],
	        agent: [Object],
	        content_type: 'text/plain;charset=utf-8',
	        content_length: '64' },
	     resultHeaders: 
	      { server: 'CouchDB/1.1.1 (Erlang OTP/R14B)',
	        location: 'http://127.0.0.1/_utils/session.html?return=%2F_active_tasks&reason=You%20are%20not%20a%20server%20admin.',
	        date: 'Tue, 26 Apr 2011 11:47:53 GMT',
	        'content-type': 'text/plain;charset=utf-8',
	        'content-length': '64',
	        'cache-control': 'must-revalidate' } } }
	

See more examples [here](https://github.com/landeiro/PJsonCouch/wiki/PJsonCouch).

## TODO

There are yet some CouchDB HTTP API methods to cover, that i'll hope to update as soon as possible.

 

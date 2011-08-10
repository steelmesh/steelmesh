var PJsonCouch = require("./lib/PJsonCouch.js");
var fs = require("fs");

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
	debugWithHeaders: true,
	throwExceptionsOnError: false
});

// Attenion: I will delete and create this db for tests 
var dbForTest = "mytempdblandeiro123"; 

// Docs for test
var docs = [{_id:"objmyid0",a:0},{_id:"objmyid1",a:1},{_id:"objmyid2",a:3},{_id:"objmyid4",a:4},{_id:"objmyid5",a:5},{_id:"objmyid6",a:6},{_id:"objmyid7",a:7}];

// Remove login if your DB is not protected
test.login({user:"landeiro",password:"123"},function(r){
	test.queryDB({db:dbForTest}, function(r){
		if (r.error === "not_found")
		proceedWithTests();
		else 
		test.deleteDB({db:dbForTest},function (r) {if (r.ok) proceedWithTests();})
	});
});

// Will create DB, save Bulks docs, get a Doc and delete it.
function proceedWithTests() {

	test.createDB({db:dbForTest},function () { 
		test.setDB({db:dbForTest});
		// Save bulk, supports all request data from original couchdb API 
		test.saveBulkDocs({docs:docs},function(r){
			log("insert bulk",r);
			// Get Doc, supports all arguments from original couchdb API 
			test.getDoc({id:"objmyid0"},function (gdoc) {
				log("*get doc*",gdoc)
				if (!gdoc.error) {
					// Delete a Doc, supports all arguments from original couchdb API 
					test.deleteDoc({doc:gdoc}, function (r) { log("*deleted "+gdoc._id+"*",r); saveDocsTests(); });
				}
			});
		});
	});

}

// will save, update, info and copy docs,
function saveDocsTests() {
	//Saving a Doc, supports all arguments from original couchdb API 
	test.saveDoc({doc:{name:"pedro",surname:"landeiro"}},function (r) {log("*save doc withoutid*",r);});
	test.saveDoc({doc:{"_id": "myownid","name": "pedro","surname": "landeiro"}},function (r) {
		log("*save doc with id*",r);
		test.getDoc({id:"myownid"},function (gDoc) {
			//Updating a existing doc
			gDoc.newfield = "this is a new field";
			// will save doc with the new field
			test.saveDoc({doc:gDoc},function (r) {
				log("*updated doc "+gDoc._id+"*",r);
				// Copy Doc, supports all arguments and request data from original couchdb API 
				test.copyDoc({source:{id:"myownid",rev:r._rev},destination:{id:"copied_doc"}}, function (r){
					log("*copied updated doc with id copied_doc",r);
					//Info Docs, supports all arguments from original couchdb API 
					test.infoDoc({id:"copied_doc"}, function (r){log("*info from previous copied doc*",r); localDocsTests()});
				})

			});
		});

	});
}

// will save, update, info and copy docs locally,
function localDocsTests() {
	console.log("LOCAL DOCS");
	//Saving a Doc, supports all arguments from original couchdb API 
	test.saveDoc({doc:{_id: "myownidlocal","name": "pedro","surname": "landeiro"},local:true},function (r) {
		log("*save doc with id*",r);
		test.getDoc({id:"myownidlocal",local:true},function (gDoc) {
			//Updating a existing doc
			gDoc.newfield = "this is a new field in local doc";
			// will save doc with the new field
			test.saveDoc({doc:gDoc,local:true},function (r) {
				log("*updated doc "+gDoc._id+"*",r);
				// Copy Doc, supports all arguments and request data from original couchdb API 
				test.copyDoc({source:{id:r.id,rev:r.rev},destination:{id:"copied_doc_local"},local:true}, function (r){
					log("*copied updated doc with id copied_doc_local",r);
					//Info Docs, supports all arguments from original couchdb API 
					test.infoDoc({id:"copied_doc_local",local:true}, function (r){log("*info from previous copied doc*",r);attachmentsTests()});
				})
			});
		});

	});

}

function attachmentsTests() {
	// How to attach a binary file
	test.getDoc({id:"myownid"},function (r) {
		// *** Insert here a image file to upload ***
		fs.readFile('couchdb.png','binary', function (err, data) {
			if (err) throw err;
			// Save a binary attachment on myownid Doc
			test.saveDocAttachment({id:r._id,rev:r._rev,
				attachment:{file:"image.png",content:data,content_type:"image/png",content_encoding:"binary"}},function (r) {
					log("*insert image.png on myownid Doc*",r)
					// How to attach text content (utf-8 is the default encoding)
					test.saveDocAttachment({id:r.id,rev:r.rev,
						attachment:{file:"file.txt",content:"some text",content_type:"text/plain"}},function (r) {
							log("*insert file.txt on myownid Doc*",r);
						});
						// Get a Binary content from image file (this content is available on property 'not_json')
						test.getDocAttachment({id:r.id,attachment:{file:"image.png",content_encoding:"binary"}},function (r) {
							log("*get image.png*",r);
						});
					});
				});
			});


			test.getDoc({id:"objmyid1"},function (r) { 
				test.saveDocAttachment({id:r._id,rev:r._rev,
					attachment:{file:"fileToDelete.txt",content:"some text that will be deleted",content_type:"text/plain"}},function (r) {
						log("*insert fileToDelete.txt on objmyid1 Doc*",r);
						test.deleteDocAttachment({id:r.id,rev:r.rev,attachment:{file:"fileToDelete.txt"}}, function (r) {
							log("*delete fileToDelete.txt on objmyid1 Doc*",r);
						})
					});
				});


			}




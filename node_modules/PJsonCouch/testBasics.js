var PJsonCouch = require("./lib/PJsonCouch.js");
log = function (desc,json) {
	console.log(desc);
	console.log(json);
}

// ** THESE TESTS WILL NOT WORK, THEY ARE JUST EXAMPLES

// Examples of connections (the invocation of the constructor will not interact with the couchdb instance)
var test = PJsonCouch({protocol:"http",host:"127.0.0.1",port:5984});
var test1 = PJsonCouch({protocol:"http",host:"mydomain.com",port:80});
// Can determine the databse in the constructor
var test2 = PJsonCouch({protocol:"http",host:"anotherdomain.com",port:5984,db:"mydatabase"});

// modify the default debug settings
test.setDebugConfig({
	debug: true, /* allways show debug if true */
	debugOnError:true, /* only shows debug on error if true (this also will show debug if debug property is false) */
	debugWithHeaders: true, /* will include the reponseHeaders on debug if true */
	throwExceptionsOnError: false /* will throw exception instead of object error if true */
});


//Welcome msg
test.server({},function(r){log("welcome",r)});

//Can set the database
test.setDB({db:"mydatabase"});
// How to know my database
log("My database",test.getDB());


// How to make login
test.login({user:"landeiro",password:"123"},function(r){
	log("my session hash",r)
	//Another way to get my hash session
	log("my session hash",test.getSession());

	// How to make logout
	test.logout(function(r){log("logout",r);});

});







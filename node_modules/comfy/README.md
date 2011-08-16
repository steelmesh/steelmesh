# Comfy 

Comfy is a lightweight Node.js interface for [CouchDB](http://couchdb.apache.org/) that utilizes [Mikael Rogers'](https://github.com/mikeal) excellent [request](https://github.com/mikeal/request) library. 

The reason Comfy came into existence, is simply that Mikael's library does such a good job of HTTP request handling for Node, that is just doesn't make sense to use the raw HTTP client.  While I had some great success using [PJsonCouch](https://github.com/landeiro/PJsonCouch) I started to discover instances where the raw HTTP client of this library struggled to deal with all of couch's RESTful-ness (such as 301 redirects).

## General Usage

### Initialization

To use comfy, you first need to tell it some connection parameter information:

```js
var couch = require('comfy').init({
	url: 'http://localhost:5984/', // this is the default and can be omitted for local databases
	db: 'test', // set this parameter to specify a default database to use
	debug: true // default value is false, set to true for some console.logging
});
```

### Requesty Goodness

Once you have a connection, you can do pretty much anything you would do with couch directly.  The general principle in comfy is that we have mapped the underlying request helpers of `get`, `put`, `post`, `del` and `head` to their request counterparts and wrapped the handling to be as fault tolerant as possible.

With Couch being very RESTful, using the above methods will generally yield the following results:

- `get`: GET a document or database's details
- `put`: PUT a database or document into couch
- `post`: POST data to a couch service
- `del`: DELETE a document or database

For instance, while the general format for the above methods is a two parameter function call in the format of `function(opts, callback)` the opts parameter can be omitted for database level calls or replaced with a `string` type and comfy will try and accommodate.

The supplied callback will be triggered with two arguments, firstly an `error` if something has not worked as expected, and secondly the `response` from Couch.  In most instances this response has already been JSON parsed, however, if you are getting document attachments then generally this isn't the case.

The format of the callbacks is designed to be [async package](https://github.com/caolan/async) friendly.

## Database Level Operations

### Get Database Details

To get the details for an existing database, simply run something similar to the following:

```js
couch.get({ db: 'test' }, function(error, res) {
	if (error) {
		console.log('Could not find database');
	}
	else {
		console.log(res);
	}
});
```

Or, if you have set the default database you can omit the first parameter:

```js
couch.get(function(error, res) {
	console.log(res);
});
```

### Create a New Database

```js
couch.put(function(error, res) {
	if (! error) {
		console.log('Created database');
	}
});
```

## Document Level Operations

### Create a New Document

If you wish to create a new document and have Couch assign the document an id for you, then you would do something like the following (assuming you have set a default database in the initialization step):

```js
couch.put({ title: 'Test Document' }, function(error, res) {
	if (! error) {
		console.log('new doc created, id = ' + res._id);
	}
});
```

If, however, you wish to specify the id for the new document, then would supply that as part of the document details:

```js
couch.put({
	_id: 'test', 
	title: 'Test Document' 
});
```

## Contributing

## License

The source code is made available under the [MIT License](http://www.opensource.org/licenses/mit-license.php)

Copyright (c) 2011 Damon Oehlman

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
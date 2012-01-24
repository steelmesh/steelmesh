.. highlight:: javascript

.. _design:

===========================
Steelmesh Design Principles
===========================

Steelmesh is designed to be *different* to other Node.js hosting options.  

While other Node hosting solutions are primarily geared towards hosting a single (and hopefully popular) node application, Steelmesh aims to make hosting multiple applications on the same system (physical or virtualized) a more manageable task.

.. _design-multitenancy:

Application Multi-tenancy
=========================

Current techniques and processes for building Node.js applications focus on creating a webserver, binding to particular routes, and then binding that webserver instance to a particular port on the machine. 

Shown below, for instance, is a trivial example that uses the excellent `Express.js`__ framework::

	var app = express.createServer();

	app.get('/', function(req, res){
	    res.send('Hello World');
	});

	app.listen(3000);

If you are hosting your application on your own server, then you might be selecting port 80 as the port to bind to, or potentially hosting your node application behind `nginx`__ and proxying traffic through to your application.

__ http://expressjs.com/
__ http://nginx.org/

While these solutions are ok, older and much more boring systems have provided application multi-tenancy for quite some time, and allow you to deploy apps A,B & C into a single server instance.  

In actual fact, Express also provides this functionality by allowing express server instances to be `mounted within`__ other server instances.  Steelmesh uses these application mountpoints to allow you to run multiple applications within the one instance.

__ https://github.com/visionmedia/express/blob/master/examples/mounting/app.js

.. _design-deployment:

Application Distribution / Deployment
=====================================

.. _design-graceful-restarts:

Graceful Restarts
=================

When application updates are intercepted, at the moment Steelmesh performs a restart to ensure that applications are correctly loaded.  This is done gracefully by downloading the new application files, spawning new workers using the new application files, and once the new workers are available, instructing the old workers to shutdown.

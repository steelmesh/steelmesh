![steelmesh](https://github.com/steelmesh/steelmesh/raw/master/assets/steelmesh.png)

Steelmesh is a __distributed application framework__ build on top of [Node.js](http://nodejs.org/) and [CouchDB](http://couchdb.apache.org/) (specifically we love using [Couchbase](http://www.couchbase.org/) community editions).  

## What does it do?

Steelmesh is designed to assist with managing and scaling Node + Couch applications in a horizontal fashion.  At this stage, Steelmesh is not designed to support partitioning large datasets, but rather to:

1. Provide load distribution for small-medium sized datasets that experience a high traffic load.

2. Provide a manageable interface to a number of Couch + Node instances.

## Getting Started

OK.  Just so you know, getting an instance of Steelmesh running is reasonably involved.  Not too tricky, but it might involve some mucking around and the process is still nowhere near as refined as it will be in a few months...

Also, [Sidelab](http://www.sidelab.com/) will be running up a hosted installation of Steelmesh in the near future, so if you are feeling brave, then feel free to [message me](http://github.com/DamonOehlman) and we can look at providing you access once it's available.

### Step 1: Install CouchDB

Essentially, get an installation of CouchDB running somewhere on your network. I would recommend using one of the [Couchbase](http://couchbase.org/) distributions as they are just lovely to work with.

### Step 2: Install Node + NPM

If you don't already have Node and NPM running, then you will need to install them.  Use google - it's your friend.

### Step 3: Install Nginx

By default, Steelmesh is designed to run behind [nginx](http://nginx.org/) as this provides an ideal front-door to both CouchDB and Node.  So if you don't have nginx installed already, then go get it...

### Step 4: Install the Mesh Command Line Tools

To aid in both creating steelmesh apps, and also administering a steelmesh server we have some [command-line tools](https://github.com/steelmesh/mesh).  The simplest way to install these tools is via npm:

```
npm install mesh -g
```

Once installed, this will provide you a `mesh` command line utility.

### Step 5: Create the steelmesh DB

By default, steelmesh will attach to a CouchDB called `steelmesh`.  This database is not automatically created, so you will need to use the mesh command line tools to create it.  Run the following command to initialize the db:

```
mesh admin-create
```

This should generate something similar to the following:

```
Preparing.
Serializing.
PUT http://localhost:5984/steelmesh/_design/default
Finished push. 1-385253ac3b0c205f93dafee1d839751d
>> mesh:admin-create
- _design/default
Operation succcessful
```

This command creates the steelmesh database and uploads the required [design documents](http://guide.couchdb.org/draft/design.html) into the database.

### Step 6: Clone the Steelmesh repository

OK, you've made it this far.  Nice job. Now, in a location that you would like to run steelmesh, clone this repository:

```
git clone git://github.com/steelmesh/steelmesh.git
```

Once you have cloned the repository, change into your newly created directory and pull down the required node_modules:

```
npm install
```

Once the required modules are you should be able to run the following command:

```
node debug-server.js
```

All being well, you should see output similar to the following:

```
loading apps using the couch apploader
synchronized application resources
  info - master started
  info - worker 0 spawned
  info - worker 1 spawned
  info - listening for connections
  info - worker 1 connected
  info - worker 0 connected
```

This is a mix of some steelmesh output and output that has been generated from [cluster](http://learnboost.github.com/cluster/).

At this stage, steelmesh is operational, but not doing a lot.  Time to create an app.

### Step 7: Scaffold an Application

Now, create a directory somewhere on your local machine.  By default, the name of the folder will become the name of your Steelmesh appliation but that can be changed using the various [Configuration Options](/steelmesh/steelmesh/wiki/Configuration-Options).  Anyway, let's create an application.  I'm going to create a directory called test (because I'm creative like that):

```
mkdir test
cd test
mesh create
```

Now in the test directory, you should see a number of new files, including an app.js file.  The app.js file is basically the file that contains the information on how the application controls routes, background tasks that it does, etc, etc.  Lots of documentation coming on this... promise.

### Step 8: Publish the Application to Steelmesh

One the application has been created, you can publish the application to a Steelmesh server using the following command:

```
mesh update
```

This would generate output similar to the following:

```
Preparing test for deployment
Pushing to db...
Preparing.
Serializing.
PUT http://localhost:5984/steelmesh/test
Finished push. 1-f0ee9c0a7e63e35207220559cf35390e
Operation succcessful
```

### Step 9: Restart the Steelmesh Server

Now that you have pushed the application to the steelmesh, restart the steelmesh server (see Step 5).

You should now see the following when the server is started:

```
no configuration file, using default config
loading apps using the couch apploader
synchronizing application: test
synchronized application resources
  info - master started
  info - worker 0 spawned
  info - worker 1 spawned
  info - listening for connections
```

__NOTE:__ This is a temporary step that is required while we are properly implementing listening to CouchDB change notifications and auto reloading updated applications:

### Step 10: Start Nginx

Before we test our application, we will need to start nginx to act a reverse-proxy to both our CouchDB server and Node server.  Steelmesh comes with a [prebuilt nginx configuration](https://github.com/steelmesh/steelmesh/blob/master/nginx/conf/nginx.conf) that routes traffic to the appropriate destination.

The simplest way to start nginx is by changing to directory you installed steelmesh in and running the following command:

```
sudo nginx -p nginx/
```

This tells nginx to use the `steelmesh/nginx` directory as the nginx root, so the configuration file is loaded from the `conf` directory automatically.  __NOTE:__ The `sudo` command is required as the configuration by default listens on port 80 and binding to ports below 1024 (I think) requires superuser privileges.
 
### Step 11: See it Working (Hopefully)

If everything has gone well, then you should be able to view the following url (if you are running locally, and called your application is called `test`):

[http://localhost/test/time](http://localhost/test/time)

## Architecture Configurations

### Standalone

![Standalone Server](https://github.com/steelmesh/steelmesh/raw/master/assets/arch-standalone.png)

### Master-Master Replication

![Master-Master Replication](https://github.com/steelmesh/steelmesh/raw/master/assets/arch-master-master.png)

### Master-Slave Replication

![Master-Slave Replication](https://github.com/steelmesh/steelmesh/raw/master/assets/arch-master-slave.png)

### Distributed Architecture

![Distributed Architecture](https://github.com/steelmesh/steelmesh/raw/master/assets/arch-distributed.png)

## License

Steelmesh is distributed under the Apache License (v2).
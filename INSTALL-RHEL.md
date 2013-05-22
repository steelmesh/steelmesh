# Installing Steelmesh on RHEL / CentOS 6.x

This guide will walk you through the process of setting up Steelmesh on a RHEL based server (6.x).  This guide is based on the guide available at:

<http://www.thegeekstuff.com/2012/06/install-couch-db/>

## Core Dependencies

Install standard packages required for compilation of Erlang (and CouchDB):

```
yum install make gcc gcc-c++ libtool libicu-devel openssl-devel xulrunner-devel pcre-devel
```

## CouchDB Dependencies and Installation

### Erlang

CouchDB is written using [Erlang](http://www.erlang.org) and thus Erlang is required to compile CouchDB from source.

Download the latest stable version of Erlang R15:

```
cd /usr/src
wget http://www.erlang.org/download/otp_src_R15B03-1.tar.gz
tar xzf otp_src_R15B03-1.tar.gz
cd /usr/src/otp_src_R15B03
```

Mark Erlang Libraries that are not required:

```
touch lib/odbc/SKIP lib/wx/SKIP
```

Configure:

```
./configure --prefix=/opt/couchdb/erlang --without-termcap --without-javac --enable-smp-support --disable-hipe
```

Make:

```
make
make install
```

### cURL

The default version of cURL that is available in the OS packages is not sufficient for compiling or running CouchDB.  As such a more up-to-date version needs to be downloaded and installed from source.

Download the latest stable version of cURL:

```
cd /usr/src
wget http://curl.haxx.se/download/curl-7.30.0.tar.gz
tar xzf curl-7.30.0.tar.gz
cd curl-7.30.0
```

Configure:

```
./configure --prefix=/opt/couchdb/curl
```

Make and install:

```
make
make install
```

### SpiderMonkey

Download the 1.85 version of Mozilla's JS interpreter, SpiderMonkey:

```
cd /usr/src
wget http://ftp.mozilla.org/pub/mozilla.org/js/js185-1.0.0.tar.gz
tar xfz js185-1.0.0.tar.gz
cd js-1.8.5/js/src
```

Configure:

```
./configure
```

Make and Install:

```
make
make install
```

### CouchDB

Download the CouchDB 1.3.0 source from the Apache releases:

```
cd /usr/src
wget http://apache.mirror.uber.com.au/couchdb/source/1.3.0/apache-couchdb-1.3.0.tar.gz
tar xfz apache-couchdb-1.3.0.tar.gz
cd apache-couchdb-1.3.0
```

Prepare ENV variables:

```
export ERL=/opt/couchdb/erlang/bin/erl
export ERLC=/opt/couchdb/erlang/bin/erlc
export CURL_CONFIG=/opt/couchdb/curl/bin/curl-config
export LDFLAGS=-L/opt/couchdb/curl/lib
```

Configure:

```
./configure --prefix=/opt/couchdb/couchdb --with-erlang=/opt/couchdb/erlang/lib/erlang/usr/include/ --with-js-include=/usr/src/js-1.8.5/js/src --enable-js-trunk
```

Make and Install:

```
make
make install
```

### CouchDB User and Permissions

Next we will need to create the couchdb user:

```
adduser couchdb
```

Then, update the ownership of the couchdb var directory:

```
chown -R couchdb /opt/couchdb/couchdb/var/
```

### CouchDB Service Registration

The CouchDB installation comes prepackaged with an init script for CouchDB, we simply need to create a symbolic link for that file:

```
ln -s /opt/couchdb/couchdb/etc/rc.d/couchdb /etc/init.d/couchdb
```

### Test CouchDB

Once completed, we should be able to start the couchdb service:

```
service couchdb start
```

To validate that it is working correctly, curl the server:

```
curl http://localhost:5984/
```

If working, this should yield the following JSON output:

```json
{"couchdb":"Welcome","uuid":"b4dfec2b1ebfc53b7d7df92b089d09c8","version":"1.3.0","vendor":{"version":"1.3.0","name":"The Apache Software Foundation"}}
```

## Node.js

Steelmesh 1.0 is designed to work with Node.js 0.6.x stable releases, so we will install the latest stable release from the 0.6.x release tree:

```
cd /usr/src/
wget http://nodejs.org/dist/v0.6.21/node-v0.6.21.tar.gz
tar xzf node-v0.6.21.tar.gz
cd node-v0.6.21
```

Configure:

```
./configure --prefix=/opt/node
```

Make and Install:

```
make
make install
```

### Configure Node.js

TODO

## Nginx (Optional, but recommended)

[Nginx](http://wiki.nginx.org) is a lightweight, robust web server that is used in the Steelmesh stack to handle all incoming requests.  Requests are then passed onto the underlying node server.

To install nginx from source, do the following:

```
cd /usr/src
wget http://nginx.org/download/nginx-1.4.1.tar.gz
tar xzf nginx-1.4.1.tar.gz
cd nginx-1.4.1
```

Configure:

```
./configure --prefix=/opt/nginx
```

Make and Install:

```
make
make install
```

### Configure Nginx

To ensure nginx is started on machine start, you will need to create an `nginx` entry in `/etc/init.d`.  If you have used the paths as described in this installation guide you can use the one stored in the steelmesh repository:

```
wget -o /etc/init.d/nginx https://raw.github.com/steelmesh/steelmesh/master/config/rhel/init.d/nginx
chmod u+x /etc/init.d/nginx
```

Now, download the boilerplate nginx configuration file onto the machine:

```
wget -o /opt/nginx/conf/nginx.conf https://raw.github.com/steelmesh/steelmesh/master/config/nginx.conf
```

To validate the configuration has been downloaded succesfully, you can use the `configtest` service option:

```
service nginx configtest
```

If it's ok, then try running the service:

```
service nginx start
```

If this has worked ok, then you should be able to retrieve a document from steelmesh via nginx:

```
TODO
```

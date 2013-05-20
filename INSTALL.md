# Installing Steelmesh

## RHEL 6.x / CentOS 6.x

This guide will walk you through the process of setting up Steelmesh on a RHEL based server (6.x).  This guide is based on the guide available at:

<http://www.thegeekstuff.com/2012/06/install-couch-db/>

### Core Dependencies

Install standard packages required for compilation of Erlang (and CouchDB):

```
yum install make gcc gcc-c++ libtool libicu-devel openssl-devel
```

### Erlang Installation

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

### Install cURL

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

### Install SpiderMonkey

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

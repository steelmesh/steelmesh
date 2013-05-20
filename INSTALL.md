# Installing Steelmesh

## RHEL 6.x / CentOS 6.x

Install standard packages required for compilation of Erlang (and CouchDB):

```
yum install make gcc libtool libicu-devel openssl-devel
```

Download and extract [erlang](http://www.erlang.org):

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


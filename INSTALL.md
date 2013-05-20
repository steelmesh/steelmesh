# Installing Steelmesh

## RHEL 6.x / CentOS 6.x

Install standard packages required for compilation of Erlang (and CouchDB):

```
yum install gcc libtool xulrunner-devel libicu-devel openssl-devel
```

Download, extract and compile [erlang](http://www.erlang.org):

```
cd /usr/src
wget http://www.erlang.org/download/otp_src_R15B03-1.tar.gz | tar -xz
```

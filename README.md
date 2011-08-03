# nodeSTACK

![nodeSTACK](https://github.com/sidelab/nodestack/raw/master/assets/nodestack.png)

The nodeSTACK architecture is Sidelab's recommended and supported architecture for [nodeJS](http://nodejs.org/) web applications.  

## Powered By

- [Cluster](https://github.com/LearnBoost/cluster)
- [Connect](https://github.com/senchalabs/connect)
- [Quip](https://github.com/caolan/quip)
- [Request](https://github.com/mikeal/request)

## Installing

Installing the nodeSTACK is designed to be as simple as cloning this repository.  As many of the require node modules are required in this repository to ensure version compatibility.  However, the following modules are required as a global install:

```bash
npm install -g libxmljs

# install node-leveldb
npm install -g https://github.com/DamonOehlman/node-leveldb/tarball/master

# install microtime
npm install -g microtime
```

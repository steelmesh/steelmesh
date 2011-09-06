![steelmesh](https://github.com/steelmesh/steelmesh/raw/master/assets/steelmesh.png)

Steelmesh is a __distributed application framework__ build on top of [Node.js](http://nodejs.org/) and [CouchDB](http://couchdb.apache.org/) (specifically we love using [Couchbase](http://www.couchbase.org/) community editions).

## What does it do?

Steelmesh is designed to assist with managing and scaling Node + Couch applications in a horizontal fashion.  At this stage, Steelmesh is not designed to support partitioning large datasets, but rather to:

1. Provide load distribution for small-medium sized datasets that experience a high traffic load.

2. Provide a manageable interface to a number of Couch + Node instances.

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
.. _server:

Steelmesh Application Server
============================

The server is the primary component of Steelmesh, and is responsible for initiating the other supporting processes.  Additionally, Steelmesh is written using the `cluster`__ module of Node, and thus forks a worker process to serve incoming HTTP requests on port ``6633`` (by default).

__ http://nodejs.org/docs/latest/api/cluster.html

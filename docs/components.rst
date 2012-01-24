.. _components:

Steelmesh Components
====================

Steelmesh is made up of three primary components:

- :ref:`components-server`
- :ref:`components-monitor`
- :ref:`components-dashboard`

.. _components-server:

Steelmesh Server
----------------

The server is the primary component of Steelmesh, and is responsible for initiating the other supporting processes.  Additionally, Steelmesh is written using the `cluster`__ module of Node, and thus forks a worker process to serve incoming HTTP requests on port ``6633`` (by default).

__ http://nodejs.org/docs/latest/api/cluster.html

.. _components-monitor:

Monitor Process
---------------

The monitor process has a number of responsibilities:

- Monitoring the steelmesh application store for changes.  When an application update is detected, that application is deployed and Steelmesh is :ref:`gracefully restarted <design-graceful-restarts>` with the updated application.

.. _components-dashboard:

Administration Dashboard
------------------------
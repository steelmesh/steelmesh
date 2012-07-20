.. _monitor:

Steelmesh Monitor Process
=========================

The Monitor process is responsible for distributing both application and data updates in the Steelmesh 1.0 platform.  This process is handled thanks to `ChangeMachine`__ which responds to change notifications from `CouchDB`__ and takes appropriate action.

__ https://github.com/DamonOehlman/changemachine
__ http://couchdb.apache.org/

Core application updates are captured through listing for `_changes` against the steelmesh db configured on Couch.  When an application update is detected, the monitor simply sends a message to the steelmesh core to restart the Steelmesh App Server.  As application updates are processed on startup of Steelmesh, and workers are restarted gracefully this works well to ensure traffic is served while keeping applications up-to-date.

In addition to application updates, applications that specify CouchDB data connections are also monitored for changes, and when an update is detected these are passed through to the registered change handler within the application.

It should be noted, however, that this functionality will not be implemented in Steelmesh 2.0 as this will be considered the responsibility of an individual application to monitor updates.
This file will contain a per-release list of changes that might affect
deployments. If you are a system administrator who is
maintaining/administering a node-xmpp-bosh installation, you might
want to check this file every time you update your copy.

### v0.7.5

* strict mode for almost all source javascript files.
* Restrict the "domain" in the "route" attribute based on a regex in the configfile.
* Allow admin to specify a list of hosts to allow and deny upstream XMPP connections to.
* Better websocket handling. Use keep-alive ping/pong on websockets.

### v0.7.4

* Websocket graceful stream close handling

### v0.7.3

* [dns-srv](https://github.com/dhruvbird/dns-srv) dependency updated to v0.2.0
* Fix for new EventEmitter in node >= 0.10.0 which caused TLS negotiation failure with jabber.org and possibly other XMPP servers. See issue #66 for more details.

### v0.7.2

* [ltx](https://github.com/astro/ltx) dependency updated to v0.2.2

### v0.7.0

* Introduced a new URL /PATH/sysinfo/ which is password protected by default. Use the username 'admin' and the password set in the config file to see the contents behind this URL.

* Using [ejs](https://github.com/visionmedia/ejs) (Embedded JavaScript templates) instead of hand-crafting HTML code while displaying the status and system information pages.

* Update node-expat dependency to v2.0.0. See [issue #56](https://github.com/dhruvbird/node-xmpp-bosh/issues/56) for more details.

### v0.6.4

* *package.json* dependencies use *~* instead of *=* wherever applicable.

* Use *node-lubmerjack* instead of *log4js* for logging since we are able to now show the file name + line number + object name + function name in the log statement.

### v0.6.2

* *package.json* now has dependencies with *=* instead of *>=* to prevent future versions of dependencies breaking node-xmpp-bosh with API incompatible changes (e.g. log4js)

* Minor fixes, which reduce the memory footprint

* Updated EventPipe dependency to v0.0.5

* Fix broken GET handler - the Content-Length header was trimming down the output

* More robust XML parsing using the SAX (expat) parser. reset() the parser on error - avoid re-constructing the parser on a parsing error and better isolation for multiple streams

### v0.6.1

* Configuration variable *max_xmpp_buffer_size* changed to *max_xmpp_stanza_size*.

* node-xmpp-bosh is now optionally compatible with pidgin (and all
  xmpp clients that use libpurple) if the configuration variable
  *pidgin_compatible* is set to *true*.

* Bug-fixes to the websockets implementation - many thanks to
  [@astro](https://github.com/astro) for finding these.

* Most DOM (ltx) parser references replaced with SAX (node-expat)
  parser references. This should make things faster in general.

* Logging uses log4js instead of "logging invented here".

### v0.4.0

* Change in the public API. If you are embedding node-xmpp-bosh within
  your application, please note that the method *start()* has been
  renamed to *start_bosh()*.

### v0.3.0

* The following configuraions variable names were changed ([issue
  \#15](http://code.google.com/p/node-xmpp-bosh/issues/detail?id=15)
  on google code details these changes as well):

    * *max_data_held_bytes* to *max_data_held*

    * *max_xmpp_buffer_bytes* to *max_xmpp_buffer_size*

    * *default_inactivity_sec* to *default_inactivity*

    * *max_inactivity_sec* to *max_inactivity*

### v0.2.3

* Fixes the [Billion
  Laughs](https://en.wikipedia.org/wiki/Billion_laughs) (XML Entity
  Expansion) vulnerability.


This file will contain a per-release list of changes that might affect
deployments. If you are a system administrator who is
maintaining/administering a node-xmpp-bosh installation, you might
want to check this file every time you update your copy.

### v0.6.1

* Configuration variable *max_xmpp_buffer_size* changed to *max_xmpp_stanza_size*.

* node-xmpp-bosh is now optionally compatible with pidgin (and all
  xmpp clients that use libpurple) if the configuration variable
  *pidgin_compatible* is set to *true*.

* Bug-fixes to the websockets implementation - many thanks to @astro
  for finding these.

* Most DOM (ltx) parser references replaced with SAX (node-expat)
  parser references. This should make things faster in general.

* Logging uses log4js instead of "logging invented here".

### v0.3.0

* The following configuraions variable names were changed:

    * *max_data_held_bytes* to *max_data_held*

    * *max_xmpp_buffer_bytes* to *max_xmpp_buffer_size*

    * *default_inactivity_sec* to *default_inactivity*

    * *max_inactivity_sec* to *max_inactivity*




+------------------------------------------------------------------------------+
| An XMPP BOSH server (connection manager) written using Node.js in Javascript |
+------------------------------------------------------------------------------+

Project Home Page: http://code.google.com/p/node-xmpp-bosh/


[A] Quick Start:

    [1] To run, type:
    $ bosh-server

    [2] For running from within a node application, type:
    $ node
    > var nxb    = require("node-xmpp-bosh");
    > var server = nxb.start();
    > 
    > // To stop, type:
    > // server.stop();
    >

    [3] For a more complex setup, see the file main.js

    [4] For options, type:
    $ bosh-server --help

    OR:

    $ node `which bosh-server` --help



The BOSH is now available at: http://localhost:5280/http-bind/
(don't forget the trailing slash).


[B] Features

    * Multiple Streams
    * Stream restarts
    * Request & Response Acknowledgements
    * Chunked responses (due to node.js)
    * STARTTLS support for connecting to the backend XMPP server 
      (tested with google talk & jabber.org)
    * Custom stream attributes on stream restart requests
    * Custom attributes supported during session creation (passed on to handlers)
    * A client may request a custom inactivity period from the server by setting the
      'inactivity' attribute in the session creation request


[C] Features not Planned:

    * gzip support for communicating with the backend XMPP server


[D] Architecture:

The project itself is divided into 4 main components as of now.

    1 A BOSH front end (bosh.js). This starts and HTTP server and manages 
      the BOSH sessions and XMPP streams on those sessions. Multiple Streams, 
      message acks, etc... and handled by this component.
      This is an EventEmitter.

    2 An XMPP (Jabber) Proxy that is responsible for making single client
      connections to an XMPP server (xmpp-proxy.js). STARTTLS and any other
      XMPP specific features are handled by this component. 
      This can be replaced with any other proxy component 
      (such as 0MQ) that connects to the backend server using any 
      custom protocol. You could in theory write a Yahoo! Proxy 
      that presents XMPP compliant XML stanzas to its users but makes 
      HTTP REST calls to communicate with the Yahoo! chat servers.
      This is an EventEmitter.

    3 An endpoint lookup service (lookup-service.js) that implements rules
      for XMPP service endpoint discovery. This currently encodes various 
      rules to try in order for discovering the service endpoint.

    4 An XMPP Proxy Connection (the glue) that connects the BOSH service 
      to the XMPP Proxy (xmpp-proxy-connector.js). Using this abstraction, 
      you can connect different (or event multiple proxies) to the BOSH
      service at the same time.


    * You can add more components such as a mailing service that sends 
      emails to clients at their email addresses if the BOSH server is not
      able to send them certain messages (see the no-client event below).


    * Events Emitted by the BOSH service:

      [1] stream-add: Emitted when a new stream is requested by a client

      [2] stream-terminate: Emitted when a client requests stream termination

      [3] stream-restart: Emitted when a client requests a stream restart

      [4] nodes: Emitted when the client wants to send one or more XML
          stanzas to the backend server

      [5] no-client: Emitted when a packet to be delivered to the client
          timed out because the client was unavailable for more than a 
	  certain amount of time.
      
      [6] error: Emitted when there is an irrecoverable error. You should
          typically restart the service when this is emitted.

    * Events Understood by the BOSH service:

      [1] response: Emitted (typically by the Connector) when the backend
          server wants to send the client some XML stanza.

      [2] terminate: Emitted when the backend server wants to terminate
          the client's connection (stream).

    * Custom attributes on BOSH streams

      [1] If a stream creation request has the 'ua' attribute, it shall be
          included in all events that involve that session. This is useful
	  when embedding this library
      
      [2] If a stream restart request has the 'stream_attrs' attribute set, 
          then the value of that attribute is assumed to be a stringified
	  JSON object which is subsequently parsed and every key/value pair
	  is added as an attribute of the stream <stream:stream> tag 
	  during this stream restart. If you provide attributes such as 
	  'xmlns' that the BOSH proxy would have added by default, the 
	  defaults are ignored and the user set attribute values are 
	  preferred.


[E] References:

    * http://xmpp.org/extensions/xep-0124.html
    * http://xmpp.org/extensions/xep-0206.html 

[F] Dependencies:

    * Node.js
    * node-expat
    * ltx
    * node-uuid 
    * tav
    * underscore.js
    * jsdom (for tests)

[G] Tested with:

    * Servers:
        * jabber.org
        * gmail.com
        * facebook.com
        * Pappu 
	* Prosody IM
	* Openfile

    * Clients
        * strophe.js (http://github.com/metajack/strophejs)
        * JSJaC (https://github.com/sstrigler/JSJaC)
        * dojox.xmpp (http://dojoapi-mirror.devs.nu/jsdoc/dojox/1.2/dojox.xmpp) 
          (modified since node-xmpp-bosh doesn't support the authid attribute)
	* libpurple - Does NOT work with libpurple since libpurple
	  expects <stream:features> in the initial BOSH creation response

[H] Tested using:

    * strophe.js 

[I] Running tests:

    * cd tests
    * node basic.js [params] # To check basic working
    * node send_recv.js [params] # To check message sending/stress testing

[J] Scaling:

    * node-xmpp-bosh allows you to set custom HTTP headers in the response to
      every valid request. You can use this in combination with the 
      [http://code.google.com/p/nginx-sticky-module/ nginx-sticky-module] to
      load-blance requests across multiple running BOSH server instances.

    * You can also load balance based on the HTTP PATH requested by the 
      client. You may set up node-xmpp-bosh to accept requests as long as 
      they begin with /PREFIX/ and set up nginx to route requests to 
      /PREFIX/A/ to one instance and requests to /PREFIX/B/ to another
      instance and so on.

[K] Other Connection Managers:
    * [http://xmpp.org/about-xmpp/technology-overview/bosh/#impl-cm List on xmpp.org]
    * [http://code.stanziq.com/punjab Punjab - Python & Twisted]
    * [https://github.com/directi/chirkut Chirkut - Python & Twisted]
    * [http://blog.jwchat.org/jhb/ JabberHTTPBind - Java]
    * [http://blog.bluendo.com/ff/bosh-connection-manager-update Araneo - Python & Twisted]
    * [http://rubyforge.org/projects/rhb/ rhb - Ruby]

[L] Releases:
    * v0.0.1 == SVN Commit #39
    * v0.0.2 == SVN Commit #50
    * v0.0.3 == SVN Commit #56
    * v0.0.4 == SVN Commit #65
    * v0.0.5 == SVN Commit #76
    * v0.0.6 == SVN Commit #82
    * v0.0.7 == SVN Commit #88
    * v0.0.8 == SVN Commit #111
    * v0.0.9 == SVN Commit #125
    * v0.0.10 == SVN Commit #137
    * v0.1.0 == SVN Commit #155
    * v0.1.1 == SVN Commit #161
    * v0.1.2 == SVN Commit #164
    * v0.1.3 == SVN Commit #166
    * v0.1.4 == SVN Commit #174
    * v0.1.5 == SVN Commit #179
    * v0.1.6 == SVN Commit #182

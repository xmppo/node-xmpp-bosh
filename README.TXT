Caveat: Everything is highly subject to change

+-------------------------------------------------------+
| An XMPP BOSH server written for node.js in javascript |
+-------------------------------------------------------+

Project Home Page: http://code.google.com/p/node-xmpp-bosh/


[A] Quick Start:

    [1] To run, type:
    $ node bosh-server

    [2] For running from within a node application, type:
    $ node
    > var nxb    = require("node-xmpp-bosh");
    > var server = nxb.start();
    > 
    > // To stop, type:
    > // server.stop();
    >

    [3] For a more complex setup, see the file main.js


The BOSH is now available at: http://localhost:5280/http-bind/
(don't forget the trailing shash).


[B] Features

    * Multiple Streams
    * Stream restarts
    * Request & Response Acknowledgements (implemented but untested)
    * Chunked responses (due to node.js)
    * STARTTLS support for connecting to the backend XMPP server (tested with google talk) 

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

      [4] stanzas: Emitted when the client wants to send one or more XML
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

    * Clients
        * strophe.js (http://github.com/metajack/strophejs)
        * JSJaC (https://github.com/sstrigler/JSJaC)
        * dojox.xmpp (http://dojoapi-mirror.devs.nu/jsdoc/dojox/1.2/dojox.xmpp) 
          (modified since node-xmpp-bosh doesn't support the authid attribute)

[H] Tested using:

    * strophe.js 

[I] Running tests:

    * cd tests
    * node basic.js [params] # To check basic working
    * node send_recv.js [params] # To check message sending/stress testing

[J] Releases:
    * v0.0.1 == SVN Commit #39
    * v0.0.2 == SVN Commit #50
    * v0.0.3 == SVN Commit #56

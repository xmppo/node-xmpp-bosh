+------------------------------------------------------------------------------+
| An XMPP BOSH server (connection manager) written using Node.js in Javascript |
+------------------------------------------------------------------------------+

Project Home Page: http://code.google.com/p/node-xmpp-bosh/


[A] Quick Start:

    [1] To run, type:
    $ bosh-server

    The BOSH is now available at: http://localhost:5280/http-bind/

    [2] For options, type:
    $ bosh-server --help

    [3] For running from within a node application, type:
    $ node
    > var nxb    = require("node-xmpp-bosh");
    > var server = nxb.start();
    > 
    > // To stop, type:
    > // server.stop();
    >

    [4] For a more complex setup, see the file main.js




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
    * HTTP POST & GET (for older browsers) are suported (see README.TXT for details)
    * Benchmarks: http://code.google.com/p/node-xmpp-bosh/wiki/Benchmarks
    * Monitor the BOSH server [http://localhost:5280/] (available only if you 
      have node-xmpp-bosh running on your system)


[C] Features not Planned:

    * gzip support for communicating with the backend XMPP server


[D] Configuration parameters:

    The following parameters can be set in the configuration file 
    (see the file bosh.conf.example.js for an example). The limits mentioned
    below are all HARD limits. Soft limits are set internally, but can never exceed the
    HARD limits. You can run node-xmpp-bosh with a config file as:

    $ bosh-server --config=PATH_TO_CONFIG

    * path: The path to listen on (default: /http-bind/)
    * port: The port to listen on (default: 5280)
    * host: The host to listen on (default: 0.0.0.0)
    * max_data_held: The maximum allowable number of bytes that a POST 
      request body may contain. Any request exceeding this value will be dropped
      (default: 100000)
    * max_xmpp_buffer_size: The maximum size of an incoming XMPP buffer in 
      bytes. If the buffer exceeds this size, then the stream is terminated.
      (default: 500000)
    * max_bosh_connections: The maximum number of simultaneous connections
      that the BOSH server will entertain for any open BOSH session 
      (default: 2)
    * window_size: The size of the window when entertaining out of order 
      requests (default: 2)
    * default_inactivity: The default (or minimum) inactivity value (in 
      second) that the BOSH server will set for the session inactivity timeout
      (default: 70)
    * max_inactivity: The maximum inactivity value (in second) that the 
      BOSH server will set for the session inactivity timeout (default: 160)
    * http_headers: A JSON (object) containing HTTP headers to pass on along
      with the response (default: { })
    * no_tls_domains: A list of Domains for which TLS should NOT be used 
      if the XMPP server supports STARTTLS but does NOT require it.


[E] Architecture:

The project itself is divided into 4 main components as of now.

    1 A BOSH front end (bosh.js). This starts and HTTP server and manages 
      the BOSH sessions and XMPP streams on those sessions. Multiple Streams, 
      message acks, etc... and handled by this component.
      This is an EventPipe.

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

      [7] response-acknowledged: Emitted when a certain response was
          acknowledged by the client (i.e. Client sent an ACK for a
	  certain response that was sent to it).

    * Events Understood by the BOSH service:

      [1] response: Emitted (typically by the Connector) when the backend
          server wants to send the client some XML stanza.

      [2] terminate: Emitted when the backend server wants to terminate
          the client's connection (stream).

      [3] stream-added: Emitted when the backend server starts a new 
          XMPP stream for the client.


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

      [3] The 'from' attribute (if sent by the client) is echoed back to 
          the client by the server as the 'to' attribute in the session 
          (or stream) creation response.

    * HTTP GET support
      
      The URL for the GET handler is the same as that for the post handler.
      However, instead of passing in the data in the request body, it is 
      passed in via the 'data=' GET query parameter. JSONP is also supported
      if the 'callback=' GET query parameter is supplied.

      [1] http://localhost:5280/http-bind/?data=<body/>

      	  Response:
      	  <body condition="item-not-found" message="Invalid session ID" type="terminate"/>

      [2] http://localhost:5280/http-bind/?data=<body/>&callback=res341

      	  Response:
	  res341({"reply":"<body xmlns=\"http://jabber.org/protocol/httpbind\" condition=\"item-not-found\" message=\"Invalid session ID\" type=\"terminate\"/>"});


[F] References:

    * http://xmpp.org/extensions/xep-0124.html
    * http://xmpp.org/extensions/xep-0206.html 

[G] Dependencies:

    * Node.js (http://nodejs.org/)
    * node-expat (https://github.com/astro/node-expat)
    * ltx (https://github.com/astro/ltx)
    * node-uuid  (https://github.com/broofa/node-uuid)
    * tav (https://github.com/akaspin/tav)
    * underscore.js (https://github.com/documentcloud/underscore)
    * eventpipe (https://github.com/dhruvbird/eventpipe)
    * dns-srv (https://github.com/dhruvbird/dns-srv)
    * jsdom, for tests (https://github.com/tmpvar/jsdom)

[H] Tested with:

    * Servers:
        * Ejabberd (http://www.process-one.net/en/ejabberd/) 
	  ([http://www.jabber.org/ jabber.org], [https://www.jappix.com/ jappix.com])
        * Google Talk ([http://gmail.com/ gmail.com])
        * Facebook ([http://www.facebook.com/ chat.facebook.com])
        * Pappu
	* Prosody IM (http://prosody.im/)
	* Openfire (http://www.igniterealtime.org/projects/openfire/)

    * Clients
        * strophe.js (http://github.com/metajack/strophejs)
        * JSJaC (https://github.com/sstrigler/JSJaC)
        * dojox.xmpp (http://dojoapi-mirror.devs.nu/jsdoc/dojox/1.2/dojox.xmpp) 
          (modified since node-xmpp-bosh doesn't support the authid attribute)
	* libpurple - Does NOT work with libpurple since libpurple
	  expects <stream:features> in the initial BOSH creation response

[I] Tested using:

    * strophe.js 

[J] Running tests:

    * cd tests
    * node basic.js [params] # To check basic working
    * node send_recv.js [params] # To check message sending/stress testing
    * node stress.js [params] # To stress test node-xmpp-bosh

[K] Scaling:

    * node-xmpp-bosh allows you to set custom HTTP headers in the response to
      every valid request. You can use this in combination with the 
      [http://code.google.com/p/nginx-sticky-module/ nginx-sticky-module] to
      load-blance requests across multiple running BOSH server instances.

    * You can also load balance based on the HTTP PATH requested by the 
      client. You may set up node-xmpp-bosh to accept requests as long as 
      they begin with /PREFIX/ and set up nginx to route requests to 
      /PREFIX/A/ to one instance and requests to /PREFIX/B/ to another
      instance and so on.

[L] Other Connection Managers:
    * [http://xmpp.org/about-xmpp/technology-overview/bosh/#impl-cm List on xmpp.org]
    * [http://code.stanziq.com/punjab Punjab - Python & Twisted]
    * [https://github.com/directi/chirkut Chirkut - Python & Twisted]
    * [http://blog.jwchat.org/jhb/ JabberHTTPBind - Java]
    * [http://blog.bluendo.com/ff/bosh-connection-manager-update Araneo - Python & Twisted]
    * [http://rubyforge.org/projects/rhb/ rhb - Ruby]

[M] Releases:
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
    * v0.1.7 == SVN Commit #184
    * v0.1.8 == SVN Commit #185
    * v0.1.9 == SVN Commit #187
    * v0.1.10 == SVN Commit #188
    * v0.1.11 == SVN Commit #191
    * v0.1.12 == SVN Commit #201
    * v0.1.13 == SVN Commit #215
    * v0.1.14 == SVN Commit #233
    * v0.1.15 == SVN Commit #238
    * v0.2.0 == SVN Commit #266
    * v0.2.2 == SVN Commit #274
    * v0.2.3 == SVN Commit #311

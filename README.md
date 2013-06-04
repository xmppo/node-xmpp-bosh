# node-xmpp-bosh

An XMPP BOSH & WebSocket server (connection manager) written using node.js in Javascript

Project Home Page:
[https://github.com/dhruvbird/node-xmpp-bosh](https://github.com/dhruvbird/node-xmpp-bosh)

### [What's Changed?](https://github.com/dhruvbird/node-xmpp-bosh/blob/master/whats_changed.md)

Please see [whats_changed.md](https://github.com/dhruvbird/node-xmpp-bosh/blob/master/whats_changed.md)
to see the major changes in releases.


### Quick Start Guide

1. To run, type:
```
$ bosh-server
```
The BOSH service is now available at: [http://localhost:5280/http-bind/](http://localhost:5280/http-bind/)

2. For options, type:
```
$ bosh-server --help
```

3. For running from within a node application, type:

    ```
    $ node
    > var nxb    = require("node-xmpp-bosh");
    > var server = nxb.start_bosh();
    > 
    > // To stop, type:
    > // server.stop();
    >
    ```

4. For a more complex setup, see the file main.js



### Features

* Multiple Streams
* Stream restarts
* Request & Response Acknowledgements
* STARTTLS support for connecting to the backend XMPP server (tested with google talk & jabber.org)
* Custom stream attributes on stream restart requests
* Custom attributes supported during session creation (passed on to handlers)
* A client may request a custom inactivity period from the server by setting the 'inactivity' attribute in the session creation request
* HTTP POST & GET (for older browsers) are suported (see below for more details)
* A websocket server on the same port as the BOSH server
* Benchmarks: https://github.com/dhruvbird/node-xmpp-bosh/wiki/Benchmarks
* Monitor the BOSH server at [http://localhost:5280/http-bind/](http://localhost:5280/http-bind/) (available only if you have node-xmpp-bosh running on your system)
* Get detailed information about the running service at [http://localhost:5280/http-bind/sysinfo/](http://localhost:5280/http-bind/sysinfo/) (available only if you have node-xmpp-bosh running on your system)


### Features not Planned

* gzip support for communicating with the backend XMPP server


### Configuration parameters

The following parameters can be set in the configuration file (see the
file bosh.conf.example.js for an example). The limits mentioned below
are all HARD limits. Soft limits are set internally, but can never
exceed the HARD limits. You can run node-xmpp-bosh with a config file
as:
```
$ bosh-server --config=PATH_TO_CONFIG
```

Note: The **=** sign is important here. Replacing the equal sign with a space will NOT work.

* **path**: The path to listen on **(default: /http-bind/)**

* **port**: The port to listen on **(default: 5280)**

* **host**: The host to listen on **(default: 0.0.0.0)**

* **logging**: The logging level to start the BOSH server with **(default: INFO)**. Options: ALL, TRACE, DEBUG, INFO, WARN, ERROR, FATAL, OFF.

* **max_data_held**: The maximum allowable number of bytes that a POST request body may contain. Any request exceeding this value will be dropped **(default: 100000)**

* **max_xmpp_stanza_size**: The maximum size of an incoming XMPP
    stanza in bytes. If the stanza size exceeds this size, then the stream is terminated **(default: 500000)**

* **max_bosh_connections**: The maximum number of simultaneous connections that the BOSH server will entertain for any open BOSH session **(default: 2)**

* **window_size**: The size of the window when entertaining out of order requests **(default: 2)**

* **default_inactivity**: The default (or minimum) inactivity value (in second) that the BOSH server will set for the session inactivity timeout **(default: 70)**

* **max_inactivity**: The maximum inactivity value (in second) that the BOSH server will set for the session inactivity timeout **(default: 160)**

* **http_headers**: A JSON (object) containing HTTP headers to pass on along with the response **(default: { })**

* **no_tls_domains**: A list of Domains for which TLS should NOT be used if the XMPP server supports STARTTLS but does NOT require it **(default: [ ])**

* **firewall**: An object (map) of type { allow: [ list... ], deny: [ list... ] }, where [ list... ] means an array of strings or regular expressions which are tested against the domain connected to. ONLY One of the 2 (deny or allow) shall be used depending on which array has values. The one that is non-empty shall be used. If both are empty (default), all connections are allowed. If both are non-empty, then the ALLOW list is used and ONLY connections to the domains listed in ALLOW are connected to **(default: { allow: [ ], deny: [ ] })**

* **route_filter**: If the route attribute is set, allow connections ONLY if the route attribute matches the regex below **(default: /.\*/)**

* **pidgin_compatible**: Set to 'true' if you want to be able to use pidgin (any any other libpurple based client) with node-xmpp-bosh. If you set this to 'true', then you lose the ability to create multiple streams on a session **(default: false)**

* **trim_default_length**: The maximum length of an XML stanza to be printed. Set to -1 for unlimited line length. **(default: 256)**

* **system_info_password**: The password used to protect the /PATH/sysinfo/ URL. The username to use when prompted for authentication is 'admin' **(default: [not set])**

### Architecture

The project itself is divided into 4 main components as of now.

1. A BOSH front end (bosh.js). This starts and HTTP server and manages
the BOSH sessions and XMPP streams on those sessions. Multiple
Streams, message acks, etc... and handled by this component. This is
an [EventPipe](https://github.com/dhruvbird/eventpipe).

2. An XMPP (Jabber) Proxy that is responsible for making single client
connections to an XMPP server (xmpp-proxy.js). STARTTLS and any other
XMPP specific features are handled by this component.  This can be
replaced with any other proxy component (such as 0MQ) that connects to
the backend server using any custom protocol. You could in theory
write a Yahoo! Proxy that presents XMPP compliant XML stanzas to its
users but makes HTTP REST calls to communicate with the Yahoo! chat
servers.  This is an
[EventEmitter](http://nodejs.org/api/events.html).

3. An endpoint lookup service (lookup-service.js) that implements
rules for XMPP service endpoint discovery. This currently encodes
various rules to try in order for discovering the service endpoint.

4. An XMPP Proxy Connection (the glue) that connects the BOSH service
to the XMPP Proxy (xmpp-proxy-connector.js). Using this abstraction,
you can connect different (or event multiple proxies) to the BOSH
service at the same time.


You can add more components such as a mailing service that sends
emails to clients at their email addresses if the BOSH server is not
able to send them certain messages (see the no-client event below).


### Events Emitted by the BOSH service

1. **stream-add**: Emitted when a new stream is requested by a client

2. **stream-terminate**: Emitted when a client requests stream
termination

3. **stream-restart**: Emitted when a client requests a stream restart

4. **nodes**: Emitted when the client wants to send one or more XML
stanzas to the backend server

5. **no-client**: Emitted when a packet to be delivered to the client
timed out because the client was unavailable for more than a certain
amount of time.
      
6. **error**: Emitted when there is an irrecoverable error. You should
typically restart the service when this is emitted.

7. **response-acknowledged**: Emitted when a certain response was
acknowledged by the client (i.e. Client sent an ACK for a certain
response that was sent to it).

### Events Understood by the BOSH service

1. **response**: Emitted (typically by the Connector) when the backend
server wants to send the client some XML stanza.

2. **terminate**: Emitted when the backend server wants to terminate
the client's connection (stream).

3. **stream-added**: Emitted when the backend server starts a new XMPP
stream for the client.

4. **stream-restarted**: Emitted when the backend server restarts an
existing XMPP stream for the client.

### Custom attributes on BOSH streams

1. If a session creation request has the 'ua' attribute, it shall be
included in all events that involve that session. This is useful when
embedding this library.

2. If a stream restart request has the 'stream_attrs' attribute set,
then the value of that attribute is assumed to be a stringified JSON
object which is subsequently parsed and every key/value pair is added
as an attribute of the stream \<stream:stream\> tag during this stream
restart. If you provide attributes such as 'xmlns' that the BOSH proxy
would have added by default, the defaults are ignored and the user set
attribute values are preferred.

3. The 'from' attribute (if sent by the client) is echoed back to the
client by the server as the 'to' attribute in the session (or stream)
creation response.

### HTTP GET support
      
The URL for the GET handler is the same as that for the post handler.
However, instead of passing in the data in the request body, it is
passed in via the *data=* GET query parameter. JSONP is also supported
if the *callback=* GET query parameter is supplied.

* Example with the request passed in as a GET parameter

    ```
    http://localhost:5280/http-bind/?data=<body/>
    ```

    Response:

    ```
    <body condition="item-not-found" message="Invalid session ID" type="terminate"/>
    ```

* Example with the request and callback passed in as a GET parameter

    ```
    http://localhost:5280/http-bind/?data=<body/>&callback=res341
    ```

    Response:

    ```
    res341({"reply":"<body xmlns="http://jabber.org/protocol/httpbind" 
      condition="item-not-found" message="Invalid session ID" 
      type="terminate"/>"});
    ```


### References

* [http://xmpp.org/extensions/xep-0124.html](http://xmpp.org/extensions/xep-0124.html)
* [http://xmpp.org/extensions/xep-0206.html](http://xmpp.org/extensions/xep-0206.html)
* [http://tools.ietf.org/html/draft-moffitt-xmpp-over-websocket-00](http://tools.ietf.org/html/draft-moffitt-xmpp-over-websocket-00)


### Dependencies

* [Node.js] (http://nodejs.org/)
* [node-expat] (https://github.com/astro/node-expat)
* [ltx] (https://github.com/astro/ltx)
* [node-uuid](https://github.com/broofa/node-uuid)
* [tav](https://github.com/akaspin/tav)
* [underscore.js] (https://github.com/documentcloud/underscore)
* [eventpipe] (https://github.com/dhruvbird/eventpipe)
* [dns-srv] (https://github.com/dhruvbird/dns-srv)
* [semver] (https://github.com/isaacs/node-semver)
* [ws] (https://github.com/einaros/ws)
* [node-lumberjack] (https://github.com/dhruvbird/node-lumberjack)
* [ejs] (https://github.com/visionmedia/ejs)
* [jsdom] (https://github.com/tmpvar/jsdom) for tests
* [jslint] (https://github.com/reid/node-jslint) for running lintit.sh


### Tested with

* Servers:
    1. [Metronome](http://www.lightwitch.org/metronome) hosted at [jappix.com](https://jappix.com/)
    2. [M-Link](http://www.isode.com/products/m-link.html) hosted at [jabber.org](http://www.jabber.org/)
    3. [Google Talk](http://www.google.com/talk/) hosted at [gmail.com](http://gmail.com/)
    4. [Facebook](http://www.facebook.com/sitetour/chat.php) hosted at [chat.facebook.com](http://facebook.com/)
    5. Pappu hosted at [talk.to](https://talk.to/)
    6. [Prosody](http://prosody.im/) hosted at [dukgo.com](https://duck.co/#topic/28469000000637077)
    7. [Openfire](http://www.igniterealtime.org/projects/openfire/) hosted at [ChatMe.im](http://chatme.im/)
    8. [ejabberd](http://www.ejabberd.im/) hosted at [Jabber.fr](http://jabber.fr/)

* Clients:
    1. [strophe.js] (http://github.com/metajack/strophejs)
    2. [JSJaC] (https://github.com/sstrigler/JSJaC) used at [jappix.org](http://jappix.org/)
    3. [dojox.xmpp] (http://dojoapi-mirror.devs.nu/jsdoc/dojox/1.2/dojox.xmpp) (modified since node-xmpp-bosh doesn't support the authid attribute)
    4. libpurple (pidgin as a client)
    5. [strophe.js websocket client] (https://github.com/superfeedr/strophejs/tree/protocol-ed)
    6. [node-xmpp] (https://github.com/astro/node-xmpp)


### Tested using

1. [strophe.js] (http://github.com/metajack/strophejs)


### Running tests
```
$ cd tests
$ node basic.js [params]     # To check basic working
$ node send_recv.js [params] # To check message sending/stress testing
$ node stress.js [params]    # To stress test node-xmpp-bosh
```


### Scaling

* node-xmpp-bosh allows you to set custom HTTP headers in the response
to every valid request. You can use this in combination with the
[nginx-sticky-module](http://code.google.com/p/nginx-sticky-module/)  to
load-blance requests across multiple running BOSH server instances.

* You can also load balance based on the HTTP PATH requested by the
client. You may set up node-xmpp-bosh to accept requests as long as
they begin with /PREFIX/ and set up nginx to route requests to
/PREFIX/A/ to one instance and requests to /PREFIX/B/ to another
instance and so on.


### Other Connection Managers:
* [List on xmpp.org](http://xmpp.org/about-xmpp/technology-overview/bosh/#impl-cm)
* [Punjab - Python & Twisted](http://code.stanziq.com/punjab)
* [Chirkut - Python & Twisted](https://github.com/directi/chirkut)
* [JabberHTTPBind - Java](http://blog.jwchat.org/jhb/)
* [Araneo - Python & Twisted](http://blog.bluendo.com/ff/bosh-connection-manager-update)
* [rhb - Ruby](http://rubyforge.org/projects/rhb/)
* [Ejabberd websocket module](https://github.com/superfeedr/ejabberd-websockets)


### Identi.ca groups:
* [node-xmpp-bosh](http://identi.ca/group/nodexmppbosh)


### Services using node-xmpp-bosh

You can find a list [here](https://github.com/dhruvbird/node-xmpp-bosh/wiki/Services-using-node-xmpp-bosh)

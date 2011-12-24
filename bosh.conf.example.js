// -*-  tab-width:4  -*-

exports.config = {
	port: 5280, 
	host: '0.0.0.0', 
	path: /^\/http-bind(\/+)?$/, 
	logging: 'INFO', 

	// The maximum number of bytes that the BOSH server will 
	// "hold" from the client
	max_data_held: 100000, 

	// Terminate the session if the XMPP buffer for a stream 
	// exceeds max_xmpp_buffer_bytes bytes
	max_xmpp_buffer_size: 500000, 

	// Don't entertain more than 'max_bosh_connections' simultaneous 
	// connections on any BOSH session. This is related to the 'hold'
	// attribute
	max_bosh_connections: 2, 

	// The maximum number of packets on either side of the current 'rid'
	// that we are willing to accept.
	window_size: 2, 

	// How much time (in second) should we hold a response object 
	// before sending and empty response on it?
	default_inactivity: 70, 

	max_inactivity: 160, 

	// The value (in second) of keepalive to set on the HTTP response 
	// socket
	http_socket_keepalive: 60, 

	// The maximum number of active streams allowed per BOSH session
	max_streams_per_session: 8, 

	http_headers: { }, 

	// 
	// A list of Domains for which TLS should NOT be used 
	// if the XMPP server supports STARTTLS but does NOT
	// require it.
	// 
	// See this link for details:
	// http://code.google.com/p/node-xmpp-bosh/issues/detail?id=11
	// 
	no_tls_domains: [ /* 'chat.facebook.com' */ ], 


    // Set to 'true' if you want:
    // 
    // 1. The session creation response to contain the <stream:features/> tag.
    // 2. NO multiple streams support (only supports a single stream
    // per session in this mode).
    // 
    // Useful to work around a pidgin (libpurple) bug.
    // 
    pidgin_compatible: true

};

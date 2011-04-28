// -*-  tab-width:4  -*-

exports.config = {
	port: 5280, 
	path: /^\/http-bind\/$/, 
	logging: 'INFO', 

	// The maximum number of bytes that the BOSH server will 
	// "hold" from the client
	max_data_held_bytes: 20000, 

	// Don't entertain more than 'max_bosh_connections' simultaneous 
	// connections on any BOSH session
	max_bosh_connections: 2, 

	// The maximum number of packets on either side of the current 'rid'
	// that we are willing to accept.
	window_size: 2, 

	// How much time should we hold a response object before sending
	// and empty response to it?
	default_inactivity_sec: 70, 

	max_inactivity_sec: 160, 
	http_headers: { }

};

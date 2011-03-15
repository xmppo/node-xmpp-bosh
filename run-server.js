var bosh  = require('./bosh.js');
var us    = require('./underscore.js');
var dutil = require('./dutil.js');
var xpc   = require('./xmpp-proxy-connector.js');




// Instantiate a bosh server with the connector as a parameter.
var bosh_server = bosh.createServer({
	path: /^\/http-bind\/$/, 
	port: 8081
});

console.log("bosh_server:", bosh_server);

// The connector is responsible for communicating with the real XMPP server.
// We allow different types of connectors to exist.
var conn = new xpc.Connector(bosh_server);



bosh_server.on('error', function() {
	console.log("Error creating the BOSH server:", arguments);
});

bosh_server.on('stanzas', function(stanzas, sstate) {
	stanzas = stanzas.filter(dutil.not(us.isString));
	stanzas.forEach(function(stanza) {
		conn.stanza(stanza, sstate);
	});
});

bosh_server.on('stream-add', function(sstate) {
	conn.stream_add(sstate);
});

bosh_server.on('stream-restart', function(sstate) {
	conn.stream_restart(sstate);
});

bosh_server.on('stream-terminate', function(stream_name) {
	conn.stream_terminate(stream_name);
});

bosh_server.on('no-client', function(response) {
	conn.no_client(response);
});

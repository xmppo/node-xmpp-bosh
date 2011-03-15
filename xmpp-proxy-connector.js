var xp     = require('./xmpp-proxy.js');
var us     = require('./underscore.js');
var dutil  = require('./dutil.js');
var lookup = require('./lookup-service.js');


function XMPPProxyConnector(bosh_server) {
	this.Proxy = xp.Proxy;
	this.bosh_server = bosh_server;

	// {
	//   stream_name: {
	//     sstate: sstate, 
	//     proxy: The XMPP proxy object for this stream, 
	//     pending: [ An array of pending outgoing stanzas ] // TODO: This needs to be populated
	//   }
	// }
	//
	this.streams = { };

	this._on_xmpp_proxy_error = dutil.hitch(this, function(ex, sstate) {
		// Remove the object and notify the bosh server.
		var ss = this.streams[sstate.name];
		if (!ss) {
			return;
		}

		delete this.streams[sstate.name];
		this.bosh_server.emit('terminate', sstate);
	});

	this._on_stanza_received = dutil.hitch(this, function(stanza, sstate) {
		console.log("Connector received stanza");
		this.bosh_server.emit('response', stanza, sstate);
	});

}

XMPPProxyConnector.prototype = {
	stanza: function(stanza, sstate) {
		var ss = this.streams[sstate.name];
		if (!ss) {
			return;
		}

		ss.proxy.send(stanza.toString());
	}, 

	stream_add: function(sstate) {
		// Check if this stream name exists
		if (this.streams[sstate.name]) {
			return;
		}

		// Create a new stream.
		var proxy = new this.Proxy(sstate.to, 
			new lookup.LookupService(sstate.to), 
			sstate);

		var stream = {
			sstate: sstate, 
			proxy: proxy, 
			pending: [ ]
		};
		this.streams[sstate.name] = stream;

		proxy.on('stanza', this._on_stanza_received);
		proxy.on('error',  this._on_xmpp_proxy_error);

		proxy.connect();
	}, 

	stream_restart: function(sstate) {
		// To restart a stream, we just call restart on the XMPPProxy object.
		var ss = this.streams[sstate.name];
		if (!ss) {
			return;
		}

		ss.proxy.restart();
	}, 

	stream_terminate: function(sstate) {
		// To terminate a stream, we just call terminate on the XMPPProxy object.
		var ss = this.streams[sstate.name];
		if (!ss) {
			return;
		}

		ss.proxy.terminate();
		delete this.streams[sstate.name];
	}, 

	no_client: function(response) {
		// What to do with this response??
		console.log("No Client for this response:", response);
	}

};

exports.Connector = XMPPProxyConnector;

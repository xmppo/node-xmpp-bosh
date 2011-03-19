var xp     = require('./xmpp-proxy.js');
var us     = require('./underscore.js');
var dutil  = require('./dutil.js');
var lookup = require('./lookup-service.js');


var _30_MINUTES_IN_SEC = 30 * 60;
var _60_MINUTES_IN_SEC = 60 * 60;



function XMPPProxyConnector(bosh_server) {
	this.Proxy = xp.Proxy;
	this.bosh_server = bosh_server;

	// {
	//   stream_name: {
	//     sstate: sstate, 
	//     proxy: The XMPP proxy object for this stream, 
	//     activity: The timestamp of the last activity on this stream (from the BOSH end)
	//     pending: [ An array of pending outgoing stanzas ] // TODO: This needs to be populated
	//   }
	// }
	//
	this.streams = { };


	// Fired when an 'error' event is raised by the XMPP Proxy.
	this._on_xmpp_proxy_error = dutil.hitch(this, function(ex, sstate) {
		// Remove the object and notify the bosh server.
		var ss = this.streams[sstate.name];
		if (!ss) {
			return;
		}

		delete this.streams[sstate.name];
		this.bosh_server.emit('terminate', sstate);
	});

	// Fired every time the XMPP proxy fires the 'stanza' event.
	this._on_stanza_received = dutil.hitch(this, function(stanza, sstate) {
		console.log("Connector received stanza");
		this.bosh_server.emit('response', stanza, sstate);
	});

	// Fired every time the XMPP proxy fires the 'connect' event.
	this._on_xmpp_proxy_connected = dutil.hitch(this, function(sstate) {
		console.log("Connector received 'connect' event");
		this.bosh_server.emit('stream-added', sstate);

		// Flush out any pending packets.
		var ss = this.streams[sstate.name];
		if (!ss) {
			return;
		}

		ss.pending.forEach(function(ps /* Pending Stanza */) {
			ss.proxy.send(ps.toString());
		});

		ss.pending = [ ];
	});



	var self = this;

	// Setup a BOSH stream garbage collector that terminates 
	// XMPP streams after a certain period of inactivity.
	this._gc_interval = setInterval(function() {
		var skeys = dutil.get_keys(self.strrams);
		var _cts = new Date();

		skeys.forEach(function(k) {
			if (_cts - self.streams[k].activity > _60_MINUTES_IN_SEC * 1000) {
				// Terminate this stream.
				// 1. From the XMPP end
				self.stream_terminate(self.streams[k]);
				// TODO: 2. From the BOSH end.

				// 3. Delete this stream from our set of held streams.
				delete self.streams[k];
			}
		});
	}, _30_MINUTES_IN_SEC * 1000);

}

XMPPProxyConnector.prototype = {
	_update_activity: function(sstate) {
		sstate.activity = new Date();
	},

	stanza: function(stanza, sstate) {
		var ss = this.streams[sstate.name];
		if (!ss) {
			return;
		}

		this._update_activity(ss);

		if (ss.proxy._is_connected) {
			// Send only if connected.
			ss.proxy.send(stanza.toString());
		}
		else {
			// Buffer the packet.
			ss.pending.push(stanza);
		}

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
			activity: new Date(), 
			pending: [ ]
		};
		this.streams[sstate.name] = stream;


		proxy.on('connect', this._on_xmpp_proxy_connected);
		proxy.on('stanza',  this._on_stanza_received);
		proxy.on('error',   this._on_xmpp_proxy_error);

		proxy.connect();
	}, 

	stream_restart: function(sstate) {
		// To restart a stream, we just call restart on the XMPPProxy object.
		var ss = this.streams[sstate.name];
		if (!ss) {
			return;
		}

		this._update_activity(ss);
		ss.proxy.restart();
	}, 

	stream_terminate: function(sstate) {
		// To terminate a stream, we just call terminate on the XMPPProxy object.
		var ss = this.streams[sstate.name];
		if (!ss) {
			return;
		}

		this._update_activity(ss);
		ss.proxy.terminate();
		delete this.streams[sstate.name];
	}, 

	no_client: function(response) {
		// What to do with this response??
		console.log("No Client for this response:", response);
	}

};

exports.Connector = XMPPProxyConnector;

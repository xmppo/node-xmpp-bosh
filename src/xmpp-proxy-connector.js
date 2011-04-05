/*
 * Copyright (c) 2011 Dhruv Matani
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 */

var xp     = require('./xmpp-proxy.js');
var dutil  = require('./dutil.js');
var lookup = require('./lookup-service.js');
var util   = require('util');
var us     = require('underscore');



var DEFAULT_XMPP_PORT = 5222;




function XMPPProxyConnector(bosh_server) {
	this.Proxy = xp.Proxy;
	this.bosh_server = bosh_server;

	// {
	//   stream_name: {
	//     sstate: sstate, 
	//     proxy: The XMPP proxy object for this stream, 
	//     pending: [ An array of pending outgoing stanzas ]
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
		dutil.log_it("DEBUG", "XMPP PROXY CONNECTOR::Connector received stanza");
		this.bosh_server.emit('response', stanza, sstate);
	});

	// Fired every time the XMPP proxy fires the 'connect' event.
	this._on_xmpp_proxy_connected = dutil.hitch(this, function(sstate) {
		dutil.log_it("DEBUG", "XMPP PROXY CONNECTOR::Received 'connect' event");
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

	bosh_server.on('nodes', function(nodes, sstate) {
		nodes = nodes.filter(dutil.not(us.isString));
		nodes.forEach(function(stanza) {
			self.stanza(stanza, sstate);
		});
	});

	bosh_server.on('stream-add', dutil.hitch(this, this.stream_add));
	bosh_server.on('stream-restart', dutil.hitch(this, this.stream_restart));
	bosh_server.on('stream-terminate', dutil.hitch(this, this.stream_terminate));
	bosh_server.on('no-client', dutil.hitch(this, this.no_client));

}

XMPPProxyConnector.prototype = {

	stanza: function(stanza, sstate) {
		var ss = this.streams[sstate.name];
		if (!ss) {
			return;
		}

		// TODO:
		// Ideally, we should maintain our own _is_connected flag or some
		// such thing, but for now, we just use the Proxy's internal and
		// supposedly private member _is_connected to quickly make the check
		// that we want to.
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
			new lookup.LookupService(sstate.to, DEFAULT_XMPP_PORT, sstate.state.route), 
			sstate.attrs, 
			sstate);

		var stream = {
			sstate: sstate, 
			proxy: proxy, 
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

		ss.proxy.restart(sstate.stream_attrs);
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
		dutil.log_it("WARN", function() {
			return [ "XMPP PROXY CONNECTOR::No Client for this response:", response.toString() ];
		});
	}, 

};

exports.Connector = XMPPProxyConnector;

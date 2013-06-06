// -*-  tab-width:4  -*-

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

"use strict";

var xp	   = require('./xmpp-proxy.js');
var dutil  = require('./dutil.js');
var lookup = require('./lookup-service.js');
var util   = require('util');
var us	   = require('underscore');

var path		= require('path');
var filename	= path.basename(path.normalize(__filename));
var log			= require('./log.js').getLogger(filename);

var DEFAULT_XMPP_PORT = 5222;




function XMPPProxyConnector(bosh_server, options) {
	this.options     = options;
	this.Proxy       = xp.Proxy;
	this.bosh_server = bosh_server;

	// {
	//   stream_name: {
	//     stream: stream, 
	//     proxy: The XMPP proxy object for this stream, 
	//     pending: [ An array of pending outgoing stanzas ]
	//   }
	// }
	//
	this.streams = { };

	if (this.options.firewall) {
		if (this.options.firewall.allow) {
			log.debug("FIREWALL::ALLOW: %s", this.options.firewall.allow);
		}
		if (this.options.firewall.deny) {
			log.debug("FIREWALL::DENY: %s", this.options.firewall.deny);
		}
	}
	if (this.options.route_filter) {
		log.debug("ROUTE_FILTER: %s", this.options.route_filter)
	}

	// Fired when an 'close' event is raised by the XMPP Proxy.
	this._on_xmpp_proxy_close = function _on_xmpp_proxy_close(error, stream) {
		log.debug("%s %s - terminate stream", stream.session.sid, stream.name);
		// Remove the object and notify the bosh server.
		var ss = this.streams[stream.name];
		if (!ss) {
			return;
		}

		delete this.streams[stream.name];

		this.bosh_server.emit('terminate', stream, error);
	}.bind(this);

	// Fired every time the XMPP proxy fires the 'stanza' event.
	this._on_stanza_received = function(stanza, stream) {
		log.trace("%s %s _on_stanza_received", stream.session.sid, stream.name);
		this.bosh_server.emit('response', stanza, stream);
	}.bind(this);

	// Fired every time the XMPP proxy fires the 'connect' event.
	this._on_xmpp_proxy_connected = function(stream) {
		log.trace("%s %s _on_xmpp_proxy_connected - connected", stream.session.sid, stream.name);
		this.bosh_server.emit('stream-added', stream);

		// Flush out any pending packets.
		var ss = this.streams[stream.name];
		if (!ss) {
			return;
		}

		ss.pending.forEach(function(pending_stanza) {
			ss.proxy.send(pending_stanza.toString());
		});

		ss.pending = [ ];
	}.bind(this);

	this._on_xmpp_stream_restarted = function(stanza, stream) {
		log.trace("%s %s _on_xmpp_stream_restarted", stream.session.sid, stream.name);
		this.bosh_server.emit('stream-restarted', stream, stanza);

		var ss = this.streams[stream.name];
		if (!ss) {
			return;
		}
	}.bind(this);

	bosh_server.on('nodes', function(nodes, stream) {
		nodes = nodes.filter(us.not(us.isString));
		nodes.forEach(function(stanza) {
			this.stanza(stanza, stream);
		}.bind(this));
	}.bind(this));

	bosh_server.on('stream-add',       this.stream_add.bind(this));
	bosh_server.on('stream-restart',   this.stream_restart.bind(this));
	bosh_server.on('stream-terminate', this.stream_terminate.bind(this));
}


XMPPProxyConnector.prototype = {

	stanza: function(stanza, stream) {
		log.trace("%s %s bosh-stanza: %s", stream.session.sid, stream.name, 
                  dutil.replace_promise(dutil.trim_promise(stanza), '\n', ' '));
		var ss = this.streams[stream.name];
		if (!ss) {
			log.warn("%s %s bosh-stanza - stream not available", stream.session.sid, stream.name);
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

	stream_add: function(stream) {
		log.trace("%s %s stream_add", stream.session.sid, stream.name);
		// Check if this stream name exists
		if (this.streams[stream.name]) {
			return;
		}

		var _ls_ctor = this.options.lookup_service || lookup.LookupService;
		var _ls      = new _ls_ctor(DEFAULT_XMPP_PORT, stream);

		// Create a new stream.
		var proxy = new this.Proxy(stream.to, _ls, stream.attrs, 
								   this.options, stream);

		var stream_object = {
			stream: stream, 
			proxy: proxy, 
			pending: [ ]
		};
		this.streams[stream.name] = stream_object;

		proxy.on('connect', this._on_xmpp_proxy_connected);
		proxy.on('restart', this._on_xmpp_stream_restarted);
		proxy.on('stanza',  this._on_stanza_received);
		proxy.on('close',   this._on_xmpp_proxy_close);

		proxy.connect();
	}, 

	stream_restart: function(stream) {
		// To restart a stream, we just call restart on the XMPPProxy object.
		var ss = this.streams[stream.name];
		if (!ss) {
			return;
		}

		log.trace("%s %s stream_restart", stream.session.sid, stream.name);
		ss.proxy.restart(stream.attrs);
	}, 

	stream_terminate: function(stream) {
		// To terminate a stream, we just call terminate on the XMPPProxy object.
		var ss = this.streams[stream.name];
		if (!ss) {
			return;
		}

		log.debug("%s %s stream_terminate", stream.session.sid, stream.name);
		ss.proxy.terminate();
		delete this.streams[stream.name];
	}

};

exports.Connector = XMPPProxyConnector;

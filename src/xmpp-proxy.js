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

/* The STARTTLS bits are taken from the node-xmpp project on github by astro */

var net    = require('net');
var ltx    = require('ltx');
var events = require("events");
var util   = require('util');
var dutil  = require('./dutil.js');
var us     = require('underscore');


var NS_XMPP_TLS = 'urn:ietf:params:xml:ns:xmpp-tls';
var NS_STREAM = 'http://etherx.jabber.org/streams';
var NS_XMPP_STREAMS = 'urn:ietf:params:xml:ns:xmpp-streams';


function XMPPProxy(xmpp_host, lookup_service, stream_attrs, void_star) {
	this._xmpp_host      = xmpp_host;
	this._void_star      = void_star;
	this._lookup_service = lookup_service;
	this._default_stream_attrs = {
		'xmlns:stream': 'http://etherx.jabber.org/streams', 
		xmlns:          'jabber:client',
		to:             this._xmpp_host, 
		version:        '1.0'
	};

	this._buff         = '';
	this._first        = true;
	this._is_connected = false;
	this._terminate_on_connect = false;

	return this;
}


util.inherits(XMPPProxy, events.EventEmitter);

exports.Proxy = XMPPProxy;

dutil.copy(XMPPProxy.prototype, {
	_detach_handlers: function() {
		this._sock.removeAllListeners('connect');
		this._sock.removeAllListeners('data');
		this._sock.removeAllListeners('error');
	}, 

	_attach_handlers: function() {
		this._sock.on('connect', us.bind(this._on_connect, this));
		this._sock.on('data',    us.bind(this._on_data, this));
		this._sock.on('close',   us.bind(this._on_close, this));
		this._sock.on('error',   function() { });
		// TODO: Handle the 'end' event.
	}, 

	_starttls: function() {
		// Vishnu hates 'self'
		var self = this;
		this._detach_handlers();

		var ct = require('./starttls.js')(this._sock, { }, function() {
			// Restart the stream.
			self.restart();
	    });

	    // The socket is now the cleartext stream
		this._sock = ct;

		self._attach_handlers();
	},

	_get_stream_xml_open: function(stream_attrs) {
		stream_attrs = stream_attrs || { };
		dutil.extend(stream_attrs, this._default_stream_attrs);
		return new ltx.Element('stream:stream', stream_attrs).toString().replace(/\/>$/, '>');
	}, 

	_on_stanza: function(stanza) {
		// Check if this is a STARTTLS request or response.
		// TODO: Check for valid Namespaces too.

		// dutil.log_it("DEBUG", "XMPP PROXY::Is stream:features?", stanza.is('features'));
		// dutil.log_it("DEBUG", "XMPP PROXY::logging starttls:", stanza.getChild('starttls'));
		if (stanza.is('features') &&
			stanza.getChild('starttls')) {
			/* Signal willingness to perform TLS handshake */
			dutil.log_it("DEBUG", "XMPP PROXY::STARTTLS requested");
			var _starttls_request = 
				new ltx.Element('starttls', {
					xmlns: NS_XMPP_TLS
				}).toString();
			dutil.log_it("DEBUG", "XMPP PROXY::Writing out STARTTLS request:", _starttls_request);
			this.send(_starttls_request);
		} else if (stanza.is('proceed')) {
	        /* Server is waiting for TLS handshake */
		    this._starttls();
		}
		else {
			// No it is neither. We just handle it as a normal stanza.
			this.emit('stanza', stanza, this._void_star);
		}
	},

	connect: function() {
		// console.log(this);
		this._sock = new net.Stream();
		this._attach_handlers();
		this._lookup_service.connect(this._sock);
	},

	restart: function(stream_attrs) {
		this._buff = '';
		this._first = true;
		var _ss_open = this._get_stream_xml_open(stream_attrs);

		this.send(_ss_open);
	},

	terminate: function() {
		if (this._is_connected) {
			// Detach the 'data' handler so that we don't get any more events.
			this._sock.removeAllListeners('data');

			// Write the stream termination tag
			this.send("</stream:stream>");

			this._is_connected = false;

			// Do NOT detach the 'error' handler since that caused the server 
			// to crash.
			//
			// http://code.google.com/p/node-xmpp-bosh/issues/detail?id=5

			this._sock.destroy();
		}
		else {
			this._terminate_on_connect = true;
		}
	},

	send: function(data) {
		if (this._is_connected) {
			try {
				this._sock.write(data);
			}
			catch (ex) {
				this._is_connected = false;
				// this.on_close(true, ex);
			}
		}

	}, 

	_on_connect: function() {
		dutil.log_it('DEBUG', 'XMPP PROXY::connected');

		this._is_connected = true;

		if (this._terminate_on_connect) {
			this.terminate();
		}
		else {
			var _ss_open = this._get_stream_xml_open({ });

			// Always, we connect on behalf of the real client.
			this.send(_ss_open);

			this.emit('connect', this._void_star);
		}
	}, 

	_on_data: function(d) {
		//
		// TODO: All this will become *much* cleaner (and faster) if we move 
		// to a SAX based XML parser instead of using ltx to parse() buffers. 
		// The current implementation will fail if we get a <stream:stream/> 
		// packet. The SAX based parser will handle that very well.
		//
		dutil.log_it("DEBUG", function() {
			return dutil.sprintf("XMPP PROXY::received:%s", d.toString('binary'));
		});
		this._buff += d.toString('binary');

		if (this._first) {
			// Parse and save attribites from the first response
			// so that we may replay them in all subsequent responses.
			var ss_pos = this._buff.search("<stream:stream");
			if (ss_pos != -1) {
				this._buff = this._buff.substring(ss_pos);
				var gt_pos = this._buff.search(">");
				if (gt_pos != -1) {
					dutil.log_it("DEBUG", "XMPP PROXY::Got stream packet");
					var _ss_stanza = this._buff.substring(0, gt_pos + 1) + "</stream:stream>";
					dutil.log_it("DEBUG", "XMPP PROXY::_ss_stanza:", _ss_stanza);

					// Parse _ss_stanza and extract the attributes.
					var _ss_node = dutil.xml_parse(_ss_stanza);
					if (_ss_node) {
						this._stream_attrs = { };
						dutil.copy(this._stream_attrs, _ss_node.attrs, [
							"xmlns:stream", "xmlns", "version"
						]);

						// console.log("_ss_node:", _ss_node);
						// console.log("stream:stream attrs:", this._stream_attrs);
					}

					this._buff = this._buff.substring(gt_pos+1);

					// Now that we have the complete <stream:stream> stanza, we can set
					// this._first to false
					this._first = false;
				}
			}
		}

		// console.log("buff is:", this._buff);
		if (!this._buff) {
			return;
		}

		var stream_terminated = false;
		var st_pos = this._buff.indexOf("</stream:stream>");
		// Check for the </stream:stream> packet
		if (st_pos != -1) {
			stream_terminated = true;
			this._buff = this._buff.substring(0, st_pos);
		}

		try {
			var tmp = "<stream:stream xmlns:stream='http://etherx.jabber.org/streams' xmlns='jabber:client' version='1.0'>" + 
				this._buff + 
				"</stream:stream>";
			// console.log("TMP:", tmp);

			var node = ltx.parse(tmp);

			// If tmp is not WF-XML, then the following lines will NOT be executed.
			this._buff = '';
			// console.log('node:', node);

			var self = this;

			node.children
			.filter(dutil.not(us.isString))
			.forEach(function(stanza) {
				try {
					// NULL out the parent otherwise ltx will go crazy when we
					// assign 'stanza' as the child node of some other parent.
					stanza.parent = null;

					// Populate the attributes of this packet from those of the 
					// stream:stream stanza.
					dutil.copy(stanza.attrs, self._stream_attrs);

					// console.log("self._stream_attrs:", self._stream_attrs);

					dutil.log_it("DEBUG", function() {
						return [ "XMPP PROXY::Emiting stanza:", stanza.toString() ];
					});
					self._on_stanza(stanza);
				}
				catch (ex) {
					dutil.log_it("WARN", function() {
						return [ "XMPP PROXY::Exception handling stanza:", stanza.toString(), ex.stack ];
					});
				}
			});
		}
		catch (ex) {
			// Eat the exception.
			dutil.log_it("ERROR", "XMPP PROXY::Incomplete packet parsed in XMPPProxy::_on_data");
		}

		if (stream_terminated) {
			dutil.log_it("DEBUG", "XMPP PROXY::Got a </stream:stream> from the server");
			this.terminate();
		}

		// For debugging
		// this._sock.destroy();
	}, 

	_on_close: function(had_error) {
		had_error = had_error || false;
		dutil.log_it("WARN", "XMPP PROXY::CLOSE event triggered on XMPPProxy:had_error:", had_error);
		this.emit('close', had_error, this._void_star);
	}
});

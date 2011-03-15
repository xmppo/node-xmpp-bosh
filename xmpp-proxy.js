var net    = require('net');
var ltx    = require('ltx');
var us     = require('./underscore.js');
var dutil  = require('./dutil.js');


var NS_XMPP_TLS = 'urn:ietf:params:xml:ns:xmpp-tls';
var NS_STREAM = 'http://etherx.jabber.org/streams';
var NS_XMPP_STREAMS = 'urn:ietf:params:xml:ns:xmpp-streams';


function XMPPProxy(xmpp_host, lookup_service, void_star) {
	this._xmpp_host = xmpp_host;
	this._void_star = void_star;
	this._lookup_service = lookup_service;

	this._buff = '';
	this._first = true;

	return this;
}

var _ee = require('events').EventEmitter();
XMPPProxy.prototype = new _ee.EventEmitter();

exports.Proxy = XMPPProxy;

dutil.extend(XMPPProxy.prototype, {
	_detach_handlers: function() {
		this._sock.removeAllListeners('connect');
		this._sock.removeAllListeners('data');
		this._sock.removeAllListeners('error');
	}, 

	_attach_handlers: function() {
		this._sock.on('connect', dutil.hitch(this, this._on_connect));
		this._sock.on('data',    dutil.hitch(this, this._on_data));
		this._sock.on('error',   dutil.hitch(this, this._on_error));
		// TODO: Handle the 'end' event.
	}, 

	_starttls: function() {
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

	_on_stanza: function(stanza) {
		// Check if this is a STARTTLS request or response.
		console.log("Is stream:features?", stanza.is('features'));
		console.log("logging starttls:", stanza.getChild('starttls'));
		if (stanza.is('features') &&
			stanza.getChild('starttls')) {
			/* Signal willingness to perform TLS handshake */
			console.log("STARTTLS requested");
			var _starttls_request = 
				new ltx.Element('starttls', {
					xmlns: NS_XMPP_TLS
				}).toString();
			console.log("Writing out STARTTLS request:", _starttls_request);
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

		this._stream_start_xml = 
			dutil.sprintf("<stream:stream xmlns:stream='http://etherx.jabber.org/streams' xmlns='jabber:client' to='%s' version='%s'>", 
				this._xmpp_host, "1.0");
	},

	restart: function() {
		this._buff = '';
		this._first = true;
		this._sock.write(this._stream_start_xml);
	},

	terminate: function() {
		this._sock.write("</stream:stream>");
		this._sock.destroy();
	},

	send: function(data) {
		this._sock.write(data);
	}, 

	_on_connect: function() {
		console.log('connected', arguments);

		// Always, we connect on behalf of the real client.
		this._sock.write(this._stream_start_xml);
	}, 

	_on_data: function(d) {
		console.log("received:", d.toString());
		this._buff += d.toString();

		if (this._first) {
			// TODO: Parse and save attribites from the first response
			// so that we may replay them in all subsequent responses.
			var ss_pos = this._buff.search("<stream:stream");
			if (ss_pos != -1) {
				this._buff = this._buff.substring(ss_pos);
				var gt_pos = this._buff.search(">");
				if (gt_pos != -1) {
					console.log("Got stream packet");
					this._buff = this._buff.substring(gt_pos+1);
				}
				this._first = false;
			}
		}

		// console.log("buff is:", this._buff);
		if (!this._buff) {
			return;
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
					stanza.parent = null;
					stanza.attrs["xmlns:stream"] = 'http://etherx.jabber.org/streams';
					stanza.attrs["xmlns"] = 'jabber:client';
					console.log("Emiting stanza:", stanza);
					self._on_stanza(stanza);
				}
				catch (ex) {
					// Eat the exception.
					console.log(ex.stack);
				}
			});
		}
		catch (ex) {
			console.log("incomplete packet");
		}
	}, 

	_on_error: function(ex) {
		this.emit('error', ex, this._void_star);
	}
});


/*
xp.on('stanza', function(stanza, data) {
	console.log("STANZA:", stanza);
});
*/

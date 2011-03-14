var net   = require('net');
var ltx   = require('ltx');
var us    = require('./underscore.js');
var dutil = require('./dutil.js');



function XMPPProxy(port, host, xmpp_host, void_star) {
	this._port = port;
	this._host = host;
	this._xmpp_host = xmpp_host || host;
	this._void_star = void_star;

	this._buff = '';
	this._first = true;

	return this;
}

var _ee = require('events').EventEmitter();
XMPPProxy.prototype = new _ee.EventEmitter();

exports.Proxy = XMPPProxy;

dutil.extend(XMPPProxy.prototype, {
	connect: function() {
		console.log(this);
		this._sock = net.createConnection(this._port, this._host);
		this._sock.on('connect', dutil.hitch(this, this._on_connect));
		this._sock.on('data',    dutil.hitch(this, this._on_data));
		this._sock.on('error',   dutil.hitch(this, this._on_error));

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
			var gt_pos = this._buff.search(">");
			if (gt_pos != -1) {
				console.log("Got stream packet");
				this._buff = this._buff.substring(gt_pos+1);
			}
			this._first = false;
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
					self.emit('stanza', stanza, self._void_star);
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

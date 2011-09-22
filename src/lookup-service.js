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

var util   = require('util');
var SRV    = require('dns-srv');
var dutil  = require('./dutil.js');
var us     = require('underscore');
var events = require('events');

/* The XMPPLookupService tries to resolve the host name to connect to
 * in various ways. The order in which it tries is as follows:
 *
 * 1. Try to directly connect to a host if the route parameter is passed
 *
 * 2. Try to do an SRV record lookup for _xmpp-client._tcp record on the 
 * target domain passed in as domain_name.
 *
 * A 'connect' event is raised on the passed 'socket' if connection succeeds.
 * If all attempts fail, an 'error' event is raised on the 'socket'.
 *
 */
function XMPPLookupService(domain_name, port, route) {
	this._domain_name = domain_name;
	this._port = port;
	this._route = route;

	var _special = {
		"gmail.com": "talk.google.com", 
		"chat.facebook.com": "chat.facebook.com"
	};

	if (_special.hasOwnProperty(domain_name)) {
		if (!this._route) {
			this._route = {
				protocol: "xmpp", 
				host: _special[domain_name], 
				port: this._port
			};
		}
	}
}

util.inherits(XMPPLookupService, events.EventEmitter);

dutil.copy(XMPPLookupService.prototype, {
	connect: function(socket) {
		var self = this;

		// We first save all the user's handlers.
		var _add_all_listeners = SRV.removeListeners(socket);

		function _on_socket_connect(e) {
			dutil.log_it('DEBUG', dutil.sprintfd('LOOKUP SERVICE::Connection to %s succeeded', 
												 self._domain_name)
						);
			_add_all_listeners(true);

			// Re-trigger the connect event.
			self.emit('connect', e);
		}

		function try_connect_route() {
			// First just connect to the server if this._route is defined.
			if (self._route) {
				dutil.log_it("DEBUG", dutil.sprintfd('LOOKUP SERVICE::try_connect_route::%s:%s', 
													 self._route.host, self._route.port)
							);

				// socket.setTimeout(10000);
				socket.connect(self._route.port, self._route.host);
			}
			else {
				// Trigger the 'error' event.
				socket.emit('error');
			}
		}

		function try_connect_SRV_lookup() {
			dutil.log_it('DEBUG', dutil.sprintfd('LOOKUP SERVICE::try_connect_SRV_lookup:%s', 
												 self._domain_name)
						);

			// Then try a normal SRV lookup.

			var attempt = SRV.connect(socket, ['_xmpp-client._tcp'], 
				self._domain_name, self._port);
		}

		function give_up_trying_to_connect(e) {
			dutil.log_it('INFO', 
						 dutil.sprintfd('LOOKUP SERVICE::Giving up connection attempts to %s', 
										self._domain_name)
						);
			_add_all_listeners(true);

			// Trigger the error event.
			self.emit('error', 'host-unknown');
		}

		var cstates = [
			try_connect_route, 
			try_connect_SRV_lookup, 
			give_up_trying_to_connect
		];

		function _on_socket_error(e) {
			var next = cstates.shift();
			next(e);
		}

		socket.on('error', _on_socket_error);
		socket.on('connect', _on_socket_connect);

		// Start the avalanche.
		_on_socket_error();

	}
});

exports.LookupService = XMPPLookupService;

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


var SRV   = require('./srv.js');
var dutil = require('./dutil.js');

/* The XMPPLookupService tries to resolve the host name to connect to
 * in various ways. The order in which it tries is as follows:
 *
 * 1. Try to directly connect to a host if the route parameter is passed
 *
 * 2. Try to connect using rules for the talk.to chat service. This means
 * connecting to DOMAIN_NAME.chat.pw
 *
 * 3. Try to do an SRV record lookup for _xmpp-client._tcp record on the 
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

	if (domain_name in _special) {
		if (!this._route) {
			this._route = {
				protocol: "xmpp", 
				host: _special[domain_name], 
				port: this._port
			};
		}
	}
}


XMPPLookupService.prototype = {
	connect: function(socket) {
		var self = this;

		// We first save all the user's handlers.
		var _error_listeners   = socket.listeners('error').splice(0);
		var _connect_listeners = socket.listeners('connect').splice(0);


		function _reattach_socket_listeners() {
			// Reinstall all handlers.
			_error_listeners.unshift(0, 0);
			_connect_listeners.unshift(0, 0);

			var _el = socket.listeners('error');
			_el.splice.apply(_el, _error_listeners);

			var _cl = socket.listeners('connect');
			_cl.splice.apply(_cl, _connect_listeners);
		}

		function _on_socket_connect(e) {
			_rollback();

			// Re-trigger the connect event.
			socket.emit('connect', e);
		}

		function try_connect_route() {
			// First just connect to the server if this._route is defined.
			if (self._route) {
				dutil.log_it("DEBUG", "LOOKUP SERVICE::try_connect_route::", self._route.host, self._route.port);

				// socket.setTimeout(10000);
				socket.connect(self._route.port, self._route.host);
			}
			else {
				// Trigger the 'error' event.
				socket.emit('error');
			}
		}

		function try_connect_SRV_lookup() {
			dutil.log_it("DEBUG", "LOOKUP SERVICE::try_connect_SRV_lookup");
			
			// Then try a normal SRV lookup.
			var errbacks = socket.listeners('error').splice(0);

			var attempt = SRV.connect(socket, ['_xmpp-client._tcp'], 
				self._domain_name, self._port);

			var _e_triggered = false;
			attempt.on('error', function(e) {
				// We need to figure out why this callback is being triggered multiple
				// times. This is just a hack for now.
				if (!_e_triggered) {
					return;
				}
				_e_triggered = true;

				// Forcefully clear 'error' listeners
				var _elisteners = socket.listeners('error');
				console.error("error_listeners.length:", _elisteners.length);

				_elisteners.splice(0);

				errbacks.unshift(0, 0);
				_elisteners.splice.apply(_elisteners, errbacks);

				socket.emit('error', e);
			});
		}

		function try_connect_chatpw() {
			dutil.log_it("DEBUG", "LOOKUP SERVICE::try_connect_chatpw:", self._domain_name + ".chat.pw");

			// Do chat.pw related custom stuff.
			socket.connect(self._port, self._domain_name + ".chat.pw");
		}

		function give_up_trying_to_connect(e) {
			_rollback();

			// Trigger the error event.
			socket.emit('error', e);
		}

		var cstates = [
			try_connect_route, 
			try_connect_SRV_lookup, 
			try_connect_chatpw, 
			give_up_trying_to_connect
		];

		function _on_socket_error(e) {
			var next = cstates.shift();
			next(e);
		}

		function _rollback() {
			// Remove custom error handlers that we attached on the socket.
			// socket.removeListener('error', _on_socket_error);
			// socket.removeListener('connect', _on_socket_connect);
			socket.removeAllListeners('error');
			socket.removeAllListeners('connect');

			_reattach_socket_listeners();
		}

		socket.on('error', _on_socket_error);
		socket.on('connect', _on_socket_connect);

		// Start the avalanche.
		_on_socket_error();

	}
};



exports.LookupService = XMPPLookupService;

var SRV = require('./srv.js');

function XMPPLookupService(domain_name, server_name) {
	this._domain_name = domain_name;
	this._server_name = server_name;

	var _special = {
		"gmail.com": "talk.google.com", 
		"chat.facebook.com": "chat.facebook.com"
	};

	if (domain_name in _special) {
		this._server_name = _special[domain_name];
	}
}

// TODO: The error handler is lost if lookup is successful in certain cases. Fix that.

XMPPLookupService.prototype = {
	connect: function(socket) {
		var self = this;

		// We first save all the user's handlers.
		var _error_listeners   = socket.listeners('error').splice(0);
		var _connect_listeners = socket.listeners('connect').splice(0);


		var cstates = [
			try_connect_server_name, 
			try_connect_chatpw, 
			try_connect_SRV_lookup, 
			give_up_trying_to_connect
		];

		function _on_socket_error(e) {
			var next = cstates.shift();
			next(e);
		}

		function _reattach_socket_listeners() {
			// Reinstall all handlers.
			_error_listeners.unshift(0, 0);
			_connect_listeners.unshift(0, 0);

			var _el = socket.listeners('error');
			_el.splice.apply(_el, _error_listeners);

			var _cl = socket.listeners('connect');
			_cl.splice.apply(_cl, _connect_listeners);
		}

		function _rollback() {
			// Remove custom error handlers that we attached on the socket.
			socket.removeListener('error', _on_socket_error);
			socket.removeListener('connect', _on_socket_connect);

			_reattach_socket_listeners();
		}

		function _on_socket_connect(e) {
			_rollback();

			// Re-trigger the connect event.
			socket.emit('connect', e);
		}

		socket.on('error', _on_socket_error);
		socket.on('connect', _on_socket_connect);

		function try_connect_server_name() {
			// First just connect to the server if this._server_name is defined.
			if (self._server_name) {
				console.log("Trying to connect to: ", self._server_name);

				socket.setTimeout(10);
				socket.connect(5222, self._server_name);
			}
			else {
				// Trigger the 'error' event.
				socket.emit('error');
			}
		}

		function try_connect_SRV_lookup() {
			// Then try a normal SRV lookup.
			var attempt = SRV.connect(socket, ['_xmpp-client._tcp'], 
				self._domain_name, 5222);

			var _e_triggered = false;
			attempt.on('error', function(e) {

				// We need to figure out why this callback is being triggered multiple
				// times. This is just a hack for now.
				if (!_e_triggered) {
					return;
				}
				_e_triggered = true;
				socket.emit('error', e);
			});
		}

		function try_connect_chatpw() {
			// Do chat.pw related custom stuff.
			socket.connect(5222, self._domain_name + ".chat.pw");
		}

		function give_up_trying_to_connect(e) {
			_rollback();

			// Trigger the error event.
			socket.emit('error', e);
		}

		// Start the avalanche.
		_on_socket_error();

	}
};



exports.LookupService = XMPPLookupService;

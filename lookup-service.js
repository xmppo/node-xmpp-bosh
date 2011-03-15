var SRV = require('./srv.js');

function XMPPLookupService(domain_name, server_name) {
	this._domain_name = domain_name;
	this._server_name = server_name;

	var _special = {
		"gmail.com": "talk.google.com", 
		"talk.google.com": "talk.google.com", 
		"chat.facebook.com": "chat.facebook.com"
	};

	if (domain_name in _special) {
		this._server_name = _special[domain_name];
	}
}

XMPPLookupService.prototype = {
	connect: function(socket) {
		var self = this;

		// First just connect to the server if this._server_name is defined.
		if (this._server_name) {
			console.log("Trying to connect to: ", self._server_name);

			socket.setTimeout(10);

			socket.connect(5222, self._server_name);
			socket.on('error', _on_connection_failed_01);
			// socket.on('timeout', _on_connection_failed_01);
			return;
		}

		_on_connection_failed_01();

		var _failed_triggered = false;

		function _on_connection_failed_01(ex) {
			console.error("Failed to connect using direct host name");

			// Remove self.
			socket.removeListener('error', _on_connection_failed_01);
			// socket.removeListener('timeout', _on_connection_failed_01);

			// Cache the listeners array for the error event.
			var _error_listeners = socket.listeners('error').splice(0);

			// Then try a normal SRV lookup.
			var attempt = SRV.connect(socket,
									  ['_xmpp-client._tcp'], self._domain_name, 5222);
			attempt.on('error', function(e) {

				// We need to figure out why this callback is being triggered multiple
				// times. This is just a hack for now.
				if (!_failed_triggered) {
					return;
				}
				_failed_triggered = true;

				// Then do custom stuff.
				socket.connect(5222, self._domain_name + ".chat.pw");
				socket.on('error', function(e) {

					console.error("All lookup failed for '" + self._domain_name + "'. Throwing error");

					// Reinsert the original listeners.
					_error_listeners.unshift(0);
					_error_listeners.unshift(0);

					console.log("Error listeners:", _error_listeners);

					var _el = socket.listeners('error');
					_el.splice.apply(_el, _error_listeners);

					// Re-fire the error event.
					socket.emit('error', e);
				});
			});
		}

	}
};



exports.LookupService = XMPPLookupService;

var SRV = require('./srv.js');

function XMPPLookupService(domain_name, server_name) {
	this._domain_name = domain_name;
	this._server_name = server_name;
}

XMPPLookupService.prototype = {
	connect: function(socket) {
		// First just connect to the server if this._server_name is defined.
		if (this._server_name) {
			socket.connect(5222, this._server_name);
			return;
		}

		// Cache the listeners array for the error event.
		var _error_listeners = socket.listeners('error').splice(0);

		// Then try a normal SRV lookup.
        var attempt = SRV.connect(socket,
                                  ['_xmpp-client._tcp'], this._domain_name, 5222);
        attempt.on('error', function(e) {
			// Then do custom stuff.
            var attempt2 = socket.connect(5222, this._domain_name + ".chat.pw");
			attempt2.on('error', function(e) {

				// Reinsert the original listeners.
				_error_listeners.unshift(0);
				_error_listeners.unshift(0);
				var _el = socket.listeners('error');
				_el.splice.apply(_el, _error_listeners);

				// Re-fire the error event.
				socket.emit('error', e);
			});
        });

	}
};



exports.LookupService = XMPPLookupService;

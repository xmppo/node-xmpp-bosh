var http  = require('http');
var url   = require('url');
var ltx   = require('ltx');
var uuid  = require('node-uuid');
var dutil = require('./dutil.js');
var us    = require('./underscore.js');



// The maximum number of bytes that the BOSH server will 
// "hold" from the client.
var MAX_DATA_HELD_BYTES = 30000;

// Don't entertain more than 3 simultaneous connections on any
// BOSH session.
var MAX_BOSH_CONNECTIONS = 3;

// The maximum number of packets on either side of the current 'rid'
// that we are willing to accept.
var WINDOW_SIZE = 2;


function inflated_attrs(node) {
	var xmlns = { };
	var attrs = { };

	for (var k in node.attrs) {
		var m = k.match(/^xmlns:([\S\s]+)$/);
		if (m && m.length > 0) {
			xmlns[m[1]] = node.attrs[k];
			attrs[k] = node.attrs[k];
		}
	}

	for (var k in node.attrs) {
		for (var xk in xmlns) {
			// Looks like a smiley, doesn't it; a sad one at that :-p
			var re = new RegExp("^" + xk + ":([\\s\\S]+)$");
			var m = k.match(re);

			if (m && m.length > 0) {
				attrs[xmlns[xk] + ":" + m[1]] = node.attrs[k];
			}
		}
	}

	return attrs;
}



// Begin packet type checkers
function is_session_creation_packet(node) {
	// Coded according to the rules mentioned here:
	// http://xmpp.org/extensions/xep-0124.html#session-request
	var ia = inflated_attrs(node);
	return node.attrs.to &&
		node.attrs.ver && node.attrs.wait &&
		node.attrs.hold && !node.attrs.sid && 
		ia["urn:xmpp:xbosh:version"];
}


function is_stream_restart_packet(node) {
	// Coded according to the rules mentioned here:
	// http://xmpp.org/extensions/xep-0206.html#create and
	// http://xmpp.org/extensions/xep-0206.html#preconditions-sasl
	var ia = inflated_attrs(node);
	return ia["urn:xmpp:xbosh:restart"] == "true" && 
		node.attrs['to'];
}

function is_stream_add_request(node) {
	// Coded according to the rules mentioned here:
	// http://xmpp.org/extensions/xep-0124.html#multi-add
	return node.attrs.to && 
		node.attrs.sid && 
		node.attrs.rid && 
		!node.attrs.ver && !node.attrs.hold && !node.attrs.wait;
}

function is_stream_terminate_request(node) {
	// Coded according to the rules mentioned here:
	// http://xmpp.org/extensions/xep-0124.html#terminate
	return node.attrs.sid && 
		node.attrs.rid && 
		node.attrs.type == "terminate";
}
// End packet type checkers




// options: { path: , port: }
exports.createServer = function(options) {

	var path = options.path;
	var port = options.port;

	// This encapsulates the state for the BOSH session
	//
	// Format: {
	//   sid: {
	//     sid:
	//     rid:
	//     wait:
	//     hold:
	//     res: [ An array of HTTP response objects ]
	//     pending: [ An array of pending responses to send to the client ]
	//     ... and other jazz ...
	//   }
	// }
	//
	var sid_state = {
	}

	// This encapsulates the state for the client stream
	//
	// The same but by stream name.
	// Format: {
	//   stream_name: {
	//     name: "Stream Name", 
	//     state: The sid_state object (as above)
	//   }
	// }
	//
	var sn_state = {
	};

	// options should have:
	// sid:
	// rid:
	// wait:
	// hold:
	// content: 
	// The stream name is independent of the state
	function new_state_object(options, res) {
		options.res = [ ];
		options.pending = [ ];
		options.streams = [ ];

		// A set of responses that have been sent by the BOSH server, but
		// not yet ACKed by the client.
		// Format: { rid: new Date() }
		options.unacked_responses = { };

		// The Max value of the 'rid' (request ID) that has been 
		// sent by BOSH to the client. i.e. The highest request ID
		// responded to by us.
		options.max_rid_sent = options.rid - 1;

		// TODO: How much inactivity can we tolerate (in sec)?
		options.inactivity = 120;

		options.window = WINDOW_SIZE;
		add_held_http_connection(options, options.rid, res);

		return options;
	}


	// Begin session handlers
	function session_create(node, res) {
		var sid = uuid();
		var opt = {
			sid: sid, 
			rid: parseInt(node.attrs.rid), 
			wait: parseInt(node.attrs.wait), 
			hold: parseInt(node.attrs.hold),
			content: "text/xml; charset=utf-8"
		};

		if (node.attrs.content) {
			// If the client included a content attribute, we mimic it.
			opt.content = node.attrs.content;
		}

		if (node.attrs.ack) {
			// If the client included an ack attribute, we support ACKs.
			opt.ack = 1;
		}

		var state = new_state_object(opt, res);
		sid_state[sid] = state;
		return state;
	}

	function session_terminate(state) {
		if (state.streams.length != 0) {
			console.error("Terminating potentially non-empty BOSH session with SID: " + state.sid);
		}

		state.res.forEach(function(res) {
			try {
				res.res.destroy();
			}
			catch (ex) {
				console.error("session_terminate::Caught exception '" + ex + "' while destroying socket");
			}
		});

		state.res = [ ];
		delete sid_state[state.sid];
	}


	// End session handlers


	// Begin stream handlers
	function stream_add(state, node) {
		var sname = uuid();
		var sstate = {
			name:  sname, 
			to:    node.attrs.to, 
			state: state
		};
		state.streams.push(sname);

		sn_state[sname] = sstate;
		return sstate;
	}

	function get_streams_to_terminate(node, state) {
		var streams = state.streams; // The streams to terminate
		if (node.attrs.stream) {
			streams = [ node.attrs.stream ];
		}

		return streams.map(function(x) {
			return sn_state[x];
		}).filter(dutil.not(us.isUndefined))
		.filter(dutil.not(us.isNull));

		// TODO: From streams, remove all entries that are 
		// null or undefined, and log this condition.
	}

	function stream_terminate(stream, state) {
		var sstream = sn_state[stream.name];
		if (sstream) {
			delete sn_state[stream.name];
		}
		var pos = state.streams.indexOf(stream.name);
		if (pos != -1) {
			state.streams.splice(pos, 1);
		}
	}
	// End stream handlers


	function is_valid_packet(node, state) {
		console.log("is_valid_packet::node.attrs.rid, state.rid:", node.attrs.rid, state.rid);

		// Allow variance of "window" rids on either side. This is in violation
		// of the XEP though.
		return state && node.attrs.sid && node.attrs.rid && 
			node.attrs.rid > state.rid - state.window && 
			node.attrs.rid < state.rid + state.window + 1;
	}

	function get_state(node) {
		var sid = node.attrs.sid;
		var state = sid ? sid_state[sid] : null;
		return state;
	}


	function add_held_http_connection(state, rid, res) {
		// If a client makes more connections than allowed, trim them.
		// http://xmpp.org/extensions/xep-0124.html#overactive

		if (state.res.length >= MAX_BOSH_CONNECTIONS) {
			// Just send the termination message and destroy the socket.
			var _ro = {
				res: res, 
				to: null, 
				rid: rid // This is the 'rid' of the request associated with this response.
			};
			send_session_terminate(_ro, state, 'policy-violation');
			session_terminate(state);
		}

		var ro = {
			res: res, 
			rid: rid, // This is the 'rid' of the request associated with this response.
			// timeout the connection if no one uses it for more than state.wait sec.
			to: setTimeout(function() {
				var pos = state.res.indexOf(ro);
				if (pos == -1) {
					return;
				}
				// Remove self from list of held connections.
				state.res.splice(pos, 1);
				// Send back an empty body element.
				send_no_requeue(ro, state, new ltx.Element('body', {
					xmlns: 'http://jabber.org/protocol/httpbind'
				}));
			}, state.wait * 1000)
		};
		state.res.push(ro);

		return state;
	}

	// Fetches a "held" HTTP response object that we can potentially
	// send responses to.
	function get_response_object(sstate /* or state */) {
		var res = sstate.name ? sstate.state.res : sstate.res;
		var ro = res ? (res.length > 0 ? res.shift() : null) : null;
		if (ro) {
			clearTimeout(ro.to);
		}
		console.warn("Holding ", res.length, " response objects");
		return ro;
	}

	function send_session_creation_response(sstate) {
		var state = sstate.state;
		var ro    = get_response_object(sstate);

		// We _must_ get a response object. If we don't, there is something
		// seriously messed up. Log this.
		if (!ro) {
			console.error("Could not find a response object for stream:", sstate);
			return false;
		}

		var response = new ltx.Element('body', {
			xmlns:      'http://jabber.org/protocol/httpbind', 
			stream:     sstate.name, 
			sid:        state.sid, 
			wait:       state.wait, 
			ver:        state.ver, 
			polling:    20, 
			inactivity: 60, 
			requests:   WINDOW_SIZE, 
			hold:       state.hold, 
			from:       sstate.to, 
			content:    state.content, 
			// secure:     'false', 
			// 'ack' is set by the client. If the client sets 'ack', then we also
			// do acknowledged request/response.
			"window":   WINDOW_SIZE // Handle window size mismatches
		});

		send_or_queue(ro, response, sstate);
	}

	function send_stream_add_response(sstate) {
		var state = sstate.state;
		var ro    = get_response_object(sstate);

		var response = new ltx.Element('body', {
			xmlns:      'http://jabber.org/protocol/httpbind', 
			stream:     sstate.name, 
			from:       sstate.to
		});

		send_or_queue(ro, response, sstate);
	}


	function emit_stanzas_event(stanzas, state, sstate) {
		if (!sstate) {
			// No stream name specified. This packet needs to be
			// broadcast to all open streams on this BOSH session.
			state.streams.forEach(function(sname) {
				var ss = sn_state[sname];
				if (ss) {
					bee.emit('stanzas', stanzas, ss);
				}

			});
		}
		else {
			bee.emit('stanzas', stanzas, sstate);
		}
	}


	function on_no_client_found(response, sstate) {
		// We create a timeout for 'wait' second, and add it to the
		// list of pending responses. If and when a new HTTP request
		// for this jid is detected, it will clear all pending
		// timeouts and send all the packets.
		var _po = {
			to: null, 
			response: response, 
			sstate: sstate
		};
		var state = sstate.state;
		state.pending.push(_po);

		// If no one picks up this packet within state.inactivity second, 
		// we should report back to the connector.
		var to = setTimeout(function() {
			var _index = state.pending.indexOf(_po);
			state.pending.splice(_index, 1);
			bee.emit('no-client', response);
		}, state.inactivity * 1000);

		_po.to = to;
	}

	function send_no_requeue(ro, state, response) {
		/* Send a response, but do NOT requeue if it fails */
		console.log("send_no_requeue()");
		ro.res.on('error', function() { });

		console.log("Writing response:", response);
		ro.res.writeHead(200, {
			"Content-Type": "text/xml"
		});

		// If the client has enabled ACKs, then acknowledge the highest request
		// that we have received till now -- if it is not the current request.
		if (state.ack && ro.rid < state.rid) {
			response.attrs.ack = state.rid;
			state.unacked_responses[ro.rid] = new Date();
			state.max_rid_sent = Math.max(state.max_rid_sent, ro.rid);
		}

		ro.res.end(response.toString());
	}

	function send_or_queue(ro, response, sstate) {
		/* Send a response and requeue if the sending fails */
		console.log("send_or_queue::ro:", ro != null);
		if (ro) {
			// On error, try the next one or start the timer if there
			// is nothing left to try.
			ro.res.on('error', function() {
				var _ro = get_response_object(sstate);

				if (_ro) {
					// Try the next one
					send_or_queue(_ro, response, sstate);
				}
				else {
					on_no_client_found(response, sstate);
				}
			});

			send_no_requeue(ro, sstate.state, response);
		}
		else {
			// No HTTP connection for sending the response exists.
			on_no_client_found(response, sstate);
		}
	}

	function send_pending_responses(state) {
		// There is a subtle bug here. If the sending of this response fails
		// then it is appended to the queue of pending responses rather than 
		// being added to the right place. This is because we rely on 
		// send_or_queue() to append it back to the list of pending responses.
		// We hope for this to not occur too frequently.
		// The right way to do it would be to remove it from the pending queue
		// only when it is sent successfully. However, due to the async nature 
		// of things, we let this be this way for now.
		//
		// Either ways, in practice, this out of order delivery can occur if
		// the 2nd HTTP response (of the 2 held responses) reaches the client 
		// first, so we needn't worry about this too much. (This can cause 
		// problems with the 'rid' parameter though).
		//

		console.log("send pending responses:", state.pending.length);

		if (state.pending.length > 0) {
			var ro = get_response_object(state);
			var _po = state.pending.shift();
			send_or_queue(ro, _po.response, _po.sstate);
		}
	}

	function send_session_terminate(ro, state, condition) {
		var attrs = {
			xmlns:      'http://jabber.org/protocol/httpbind', 
			sid:        state.sid, 
			type:       'terminate', 
			condition:  condition
		};
		var response = new ltx.Element('body', attrs);

		send_no_requeue(ro, state, response);
	}


	// The BOSH event emitter. People outside will subscribe to
	// events from this guy. We return an instance of BoshEventEmitter
	// to the outside world when anyone calls createServer()
	function BoshEventEmitter() {
	}

	var _ee = require('events').EventEmitter();
	BoshEventEmitter.prototype = new _ee.EventEmitter();

	var bee = new BoshEventEmitter();

	// When the Connector is able to add the stream, we too do the same and 
	// respond to the client accordingly.
	bee.addListener('stream-added', function(sstate) {
		console.log("bosh server::stream-added:", sstate.stream);
		// Send only if this is the 2nd (or more) stream on this BOSH session.
		if (sstate.streams.length > 1) {
			send_stream_add_response(sstate);
		}
	});

	// When a respone is received from the connector, try to send it out to the 
	// real client if possible.
	bee.addListener('response', function(connector_response, sstate) {
		console.log("bosh server::response:", connector_response);

		var ro = get_response_object(sstate);
		// console.log("ro:", ro);

		var response = new ltx.Element('body', {
			xmlns:      'http://jabber.org/protocol/httpbind', 
			stream:     sstate.name, 
			sid:        sstate.state.sid
		}).cnode(connector_response).tree();

		send_or_queue(ro, response, sstate);
	});

	// This event is raised when the server terminates the connection.
	// The Connector typically raises this even so that we can tell
	// the client that such an event has occurred.
	bee.addListener('terminate', function(sstate) {
		// We send a terminate response to the client.
		var ro = get_response_object(sstate);
		var attrs = {
			xmlns:      'http://jabber.org/protocol/httpbind', 
			stream:     sstate.name, 
			sid:        sstate.state.sid, 
			type:       'terminate'
		};
		var response = new ltx.Element('body', attrs);
		var state = sstate.state;

		stream_terminate(sstate, state);
		send_or_queue(ro, response, sstate);

		// Should we terminate the BOSH session as well?
		if (state.streams.length == 0) {
			session_terminate(state);
		}
	});


	var http_server = http.createServer(function(req, res) {
		var u = url.parse(req.url);

		console.log("Someone connected. u:", u);

		var data = [];
		var data_len = 0;

		req.on('data', function(d) {
			console.log("onData:", d.toString());
			var _d = d.toString();
			data_len += d.length;

			// Prevent attacks. If data (in its entirety) gets too big, 
			// terminate the connection.
			if (data_len > MAX_DATA_HELD_BYTES) {
				// Terminate the connection
				data = [];
				req.destroy();
				return;
			}

			data.push(_d);
		})
		.on('end', function() {
			var node = dutil.xml_parse(data.join(""));
			data = [];

			if (!node || !node.is('body')) {
				res.destroy();
				return;
			}

			var state = get_state(node);
			var ppos = u.pathname.search(path);

			if (req.method != "POST" || ppos == -1) {
				console.error("Invalid request");
				res.destory();
				return;
			}

			console.log("Processing request");

			// Get the array of XML stanzas.
			var stanzas = node.children;

			// Handle

			// Check if this is a session start packet.
			if (is_session_creation_packet(node)) {
				console.log("Session creation");
				var state  = session_create(node, res);
				var sstate = stream_add(state, node);

				// Respond to the client.
				send_session_creation_response(sstate);

				bee.emit('stream-add', sstate);
			}
			else {
				var sname = node.attrs.stream;
				var sid   = node.attrs.sid;
				var sstate = null;

				if (sname) {
					// The stream name is included in the BOSH request.
					sstate = sn_state[sname];

					// If the stream name is present, but the stream is not valid, we
					// blow up.
					if (!sstate) {
						res.destroy();
						return;
					}
				}


				if (!sid) {
					// No stream ID in BOSH request. Not phare enuph.
					res.destroy();
					return;
				}

				var state = sid_state[sid];

				// Are we the only stream for this BOSH session?
				if (state && state.streams.length == 1) {
					// Yes, we are. Let's pretend that the stream name came along
					// with this request.
					sstate = sn_state[state.streams[0]];
				}

				// Check the validity of the packet and the BOSH session
				if (!state || !is_valid_packet(node, state)) {
					console.error("NOT a Valid packet");
					res.destroy();
					return;
				}

				// Set the current rid to the max. RID we have received till now.
				state.rid = Math.max(state.rid, node.attrs.rid);

				// Has the client enabled ACKs?
				if (state.ack) {
					/* Begin ACK handling */

					var _uar_keys = dutil.get_keys(state.unacked_responses);
					if (_uar_keys.length > WINDOW_SIZE * 4 /* We are fairly generous */) {
						// The client seems to be buggy. It has not ACKed the
						// last WINDOW_SIZE * 4 requests. We turn off ACKs.
						delete state.ack;
						state.unacked_responses = { };
					}

					if (node.attrs.ack) {
						// If the request from the client includes an ACK, we delete all
						// packets with an 'rid' less than or equal to this value since
						// the client has seen all those packets.
						_uar_keys.forEach(function(rid) {
							if (rid <= node.attrs.ack) {
								delete state.unacked_responses[rid];
							}
						});
					}

					// And has not acknowledged the receipt of the last message we sent it.
					if (node.attrs.ack 
						&& node.attrs.ack < state.max_rid_sent 
						&& state.unacked_responses[node.attrs.ack]) {
							var _ts = state.unacked_responses[node.attrs.ack];

							// We inject a response packet into the pending queue to 
							// notify the client that it _may_ have missed something.
							state.pending = new ltx.Element('body', {
								report: node.attrs.ack + 1, 
								time: new Date() - _ts, 
								xmlns: 'http://jabber.org/protocol/httpbind'
							});
					}

					/* End ACK handling */
				}

				// Add to held response objects for this BOSH session
				add_held_http_connection(state, node.attrs.rid, res);

				// Process pending (queued) responses (if any)
				send_pending_responses(state);

				// Check if this is a stream restart packet.
				if (is_stream_restart_packet(node)) {
					console.log("Stream Restart");
					bee.emit('stream-restart', sstate);

					// According to http://xmpp.org/extensions/xep-0206.html
					// the XML stanzas in a restart request should be ignored.
					// Hence, we comply.
					stanzas = [ ];
				}

				// Check if this is a new stream start packet (multiple streams)
				else if (is_stream_add_request(node)) {
					console.log("Stream Add");
					sstate = stream_add(state, node);

					// Don't yet respond to the client. Wait for the 'stream-added' event
					// from the Connector.

					bee.emit('stream-add', sstate);
				}

				// Check for stream terminate
				else if (is_stream_terminate_request(node)) {
					console.log("Stream Terminate");
					// We may be required to terminate one stream, or all
					// the open streams on this BOSH session.

					var streams_to_terminate = get_streams_to_terminate(node, state);

					streams_to_terminate.forEach(function(sstate) {
						if (stanzas.length > 0) {
							emit_stanzas_event(stanzas, state, sstate);
						}
						stream_terminate(sstate, state)
						bee.emit('stream-terminate', sstate);

						// TODO: Send stream termination response
						// http://xmpp.org/extensions/xep-0124.html#terminate
					});


					// Terminate the session if all streams in this session have
					// been terminated.
					if (state.streams.length == 0) {
						session_terminate(state);
					}
					
					// Once a stream is terminated, there is no point sending 
					// stanzas. Which is why we did the needful before sending
					// the terminate event.
					stanzas = [ ];
				}

			} // else (not session start)

			// In any case, we should process the XML stanzas.
			if (stanzas.length > 0) {
				emit_stanzas_event(stanzas, state, sstate);
			}
			

		}) // on('end')

		.on('error', function(ex) {
			console.error("Exception while processing request: " + ex);
			console.error(ex.stack);
		});

	});

	http_server.listen(options.port);

	http_server.on('error', function(ex) {
		bee.emit('error', ex);
	});

	return bee;

};

// TODO: Handle error conditions comprehensively
// http://xmpp.org/extensions/xep-0124.html#schema

// TODO: Terminate the connection with the XMPP server after X units of time.
// However, this logic will go inside the Connector, not anywhere else.

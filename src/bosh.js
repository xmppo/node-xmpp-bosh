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


var http   = require('http');
var url    = require('url');
var ltx    = require('ltx');
var util   = require('util');
var uuid   = require('node-uuid');
var dutil  = require('./dutil.js');
var us     = require('underscore');
var assert = require('assert').ok;
var EventPipe = require('eventpipe').EventPipe;


var sprintf  = dutil.sprintf;
var sprintfd = dutil.sprintfd;
var log_it   = dutil.log_it;
var toNumber = us.toNumber;


var BOSH_XMLNS = 'http://jabber.org/protocol/httpbind';
var NULL_FUNC  = dutil.NULL_FUNC;


//
// Important links:
// 
// List of BOSH errors for the terminate packet
// http://xmpp.org/extensions/xep-0124.html#errorstatus-terminal
//
// XEP-206
// http://xmpp.org/extensions/xep-0206.html
//
// CORS headers
// https://developer.mozilla.org/En/HTTP_access_control
//



// Begin packet type checkers
function is_session_creation_packet(node) {
	// Coded according to the rules mentioned here:
	// http://xmpp.org/extensions/xep-0124.html#session-request
	// Even though it says SHOULD for everything we expect, we
	// violate the XEP.
	//
	var ia = dutil.inflated_attrs(node);
	return node.attrs.to &&
		node.attrs.wait &&
		node.attrs.hold && !node.attrs.sid && 
		ia.hasOwnProperty('urn:xmpp:xbosh:version');
}


function is_stream_restart_packet(node) {
	// Coded according to the rules mentioned here:
	// http://xmpp.org/extensions/xep-0206.html#create and
	// http://xmpp.org/extensions/xep-0206.html#preconditions-sasl
	var ia = dutil.inflated_attrs(node);
	return ia['urn:xmpp:xbosh:restart'] === 'true';
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
		node.attrs.type === 'terminate';
}
// End packet type checkers


// Begin packet builders
function $body(attrs) {
	attrs = attrs || { };
	var _attrs = {
		xmlns: BOSH_XMLNS
	};
	dutil.extend(_attrs, attrs);
	return new ltx.Element('body', _attrs);
}

function $terminate(attrs) {
	attrs = attrs || { };
	attrs.type = 'terminate';
	return $body(attrs);
}

// End packet builders


// Begin HTTP header helpers
function add_to_headers(dest, src) {
	var acah = dest['Access-Control-Allow-Headers'].split(', ');
	var k;
	for (k in src) {
		if (src.hasOwnProperty(k)) {
			dest[k] = src[k];
			acah.push(k);
		}
	}
	dest['Access-Control-Allow-Headers'] = acah.join(', ');
}

function JSONPResponseProxy(req, res) {
	this.req_ = req;
	this.res_ = res;
	this.wrote_ = false;

	var _url = url.parse(req.url, true);
	this.jsonp_cb_ = _url.query.callback ? _url.query.callback : '';
	// console.log("DATA:", _url.query.data);
	// console.log("JSONP CB:", this.jsonp_cb_);

	// The proxy is used only if this is a JSONP response
	if (!this.jsonp_cb_) {
		return res;
	}
}

JSONPResponseProxy.prototype = {
	on: function() {
		return this.res_.on.apply(this.res_, arguments);
	}, 
	writeHead: function(status_code, headers) {
		var _headers = { };
		dutil.copy(_headers, headers);
		_headers['Content-Type'] = 'application/json; charset=utf-8';

		return this.res_.writeHead(status_code, _headers);
	}, 
	write: function(data) {
		if (!this.wrote_) {
			this.res_.write(this.jsonp_cb_ + '({"reply":"');
			this.wrote_ = true;
		}

		data = data || '';
		data = data.replace(/\n/g, '\\n').replace(/"/g, '\\"');
		return this.res_.write(data);
	}, 
	end: function(data) {
		this.write(data);
		if (this.jsonp_cb_) {
			this.res_.write('"});');
		}
		return this.res_.end();
	}
};
// End HTTP header helpers

// Begin misc. helpers
function route_parse(route) {
	/* Parse the 'route' attribute, which is expected to be of the
	 * form: xmpp:domain:port.
	 *
	 * Returns null or a hash of the form:
	 * { protocol: <PROTOCOL>, host: <HOST NAME>, port: <PORT> }
	 *
	 * TODO: Move this out of bosh.js and into lookup_service.js
	 */
	var m = route.match(/^(\S+):(\S+):([0-9]+)$/) || [ ];
	log_it("DEBUG", "BOSH::route_parse:", m);
	if (m && m.length === 4) {
		return {
			protocol: m[1], host: m[2], port: toNumber(m[3])
		};
	}
	else {
		return null;
	}
}

// End misc. helpers


//
// options:
//
// * path
// * port
// * host
// * max_data_held
// * max_bosh_connections
// * window_size
// * default_inactivity
// * max_inactivity
// * http_socket_keepalive
// * http_headers
//
exports.createServer = function(options) {

	// When was this server started?
	var started = new Date();

	// The maximum number of bytes that the BOSH server will 
	// "hold" from the client.
	var MAX_DATA_HELD = options.max_data_held || 100000;

	// Don't entertain more than 2 (default) simultaneous connections 
	// on any BOSH session.
	var MAX_BOSH_CONNECTIONS = options.max_bosh_connections || 2;

	// The maximum number of packets on either side of the current 'rid'
	// that we are willing to accept.
	var WINDOW_SIZE = options.window_size || 2;

	// How much time (in second) should we hold a response object 
	// before sending and empty response on it?
	var DEFAULT_INACTIVITY = options.default_inactivity || 70;

	var MAX_INACTIVITY = options.max_inactivity || 160;

	var HTTP_SOCKET_KEEPALIVE = options.http_socket_keepalive || 60;

	var MAX_STREAMS_PER_SESSION = options.max_streams_per_session || 8;

	var HTTP_GET_RESPONSE_HEADERS = {
		'Content-Type': 'application/xhtml+xml; charset=UTF-8', 
		'Cache-Control': 'no-cache, no-store', 
		'Access-Control-Allow-Origin': '*', 
		'Access-Control-Allow-Headers': 'Content-Type, x-requested-with, Set-Cookie',
		'Access-Control-Allow-Methods': 'OPTIONS, GET, POST', 
		'Access-Control-Max-Age': '14400'
	};

	var HTTP_POST_RESPONSE_HEADERS = {
		'Content-Type': 'text/xml; charset=UTF-8', 
		'Access-Control-Allow-Origin': '*', 
		'Access-Control-Allow-Headers': 'Content-Type, x-requested-with, Set-Cookie',
		'Access-Control-Allow-Methods': 'OPTIONS, GET, POST', 
		'Access-Control-Max-Age': '14400'
	};

	var HTTP_OPTIONS_RESPONSE_HEADERS = {
		'Access-Control-Allow-Origin': '*', 
		'Access-Control-Allow-Headers': 'Content-Type, x-requested-with, Set-Cookie',
		'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 
		'Access-Control-Max-Age': '14400'
	};

	if (options.http_headers) {
		add_to_headers(HTTP_GET_RESPONSE_HEADERS,     options.http_headers);
		add_to_headers(HTTP_POST_RESPONSE_HEADERS,    options.http_headers);
		add_to_headers(HTTP_OPTIONS_RESPONSE_HEADERS, options.http_headers);
	}


	// TODO: Read off the Headers request from the request and set that in the response.

	// 
	// +-------+
	// | NOTE: |
	// +-------+
	// 
	// Always ensure that you update the definitions of the objects (in the 
	// comments) as and when you add/remove members from them. Please try to 
	// keep these object definitions up-to-date since it is the main 
	// (and only) place of reference for object structure.
	// 


	// This encapsulates the state for the BOSH session
	//
	// Format: {
	//   sid: {
	//     sid:
	//     rid:
	//     wait:
	//     hold:
	//     res: [ An array of response objects (format is show below) ]
	//     pending: [ An array of pending responses to send to the client ]
	//     has_next_tick: true if a nextTick handler for this session has
	//       been registered, false otherwise
	//     ... and other jazz ...
	//   }
	// }
	//
	// Format of a single response object:
	//
	// {
	//   res: HTTP response object (obtained from node.js)
	//   timeout: A timeout, after which an empty <body> packet will be
	//            sent on this response object
	//   rid: The 'rid' of the request to which this response object is
	//        associated
	// }
	//
	// 
	var sid_state = {
	};

	// This encapsulates the state for the client (xmpp) stream
	//
	// The same but by stream name.
	// Format: {
	//   stream_name: {
	//     name: "Stream Name", 
	//     to: "domain.tld", 
	//     terminated: true/false, 
	//     state: The sid_state object (as above)
	//     from (optional): The JID of the user for this stream
	//     route (optional): The endpoint of the server to connect to (xmpp:domain:port)
	//   }
	// }
	//
	var sn_state = {
	};

	var sid_info = {
		// Stores the number of active sessions
		length: 0, 
		// Stores the total number of sessions
		total:  0
	};

	var sn_info = {
		// Stores the number of active streams
		length: 0, 
		// Stores the total number of streams
		total:  0
	};

	
	// This holds the terminate condition for terminated sessions. Both this,
	// and terminated_streams are used when the connection between nxb and xmpp 
	// server breaks and all the session related info is wiped out. We preserve 
	// the condition in this case to let the client know why was its connection 
	// broken.
	var terminated_sessions = {
	};
	
	// This keeps in memory the terminate condition for a terminated stream.
	var terminated_streams = {
	};

	function save_terminate_condition_for_wait_time (obj, attr, condition, wait) {
		obj[attr] = {
			condition: condition,
			timer: setTimeout(function () {
				if (obj[attr]) {
					delete obj[attr];
				}
			}, (wait + 5) * 1000)
		};
	}

	function stat_stream_add() {
		++sn_info.length;
		++sn_info.total;
	}

	function stat_stream_terminate() {
		--sn_info.length;
	}

	//
	// options MUST have:
	// ------------------
	// sid:
	// rid:
	// wait:
	// hold:
	// content: 
	//
	// and MAY have:
	// -------------
	// inactivity:
	// 
	// The stream name is independent of the state
	// 
	function new_state_object(options) {

		options.hold = options.hold > MAX_BOSH_CONNECTIONS ? MAX_BOSH_CONNECTIONS : options.hold;

		// res needs is sorted in 'rid' order.
		options.res = [ ];

		//
		// Contains objects of the form:
		// { response: <The body element>, sstate: <The stream state object> }
		//
		options.pending = [ ];

		// This is just an array of strings holding the stream names
		options.streams = [ ];

		// A set of responses that have been sent by the BOSH server, but
		// not yet ACKed by the client.
		// Format: { rid: { response: [Response Object with <body> wrapper], ts: new Date() } }
		options.unacked_responses = { };

		// A set of queued requests that will become complete when "holes" in the
		// request queue are filled in by packets with the right 'rids'
		options.queued_requests = { };

		// The Max value of the 'rid' (request ID) that has been 
		// sent by BOSH to the client. i.e. The highest request ID
		// responded to by us.
		options.max_rid_sent = options.rid - 1;

		if (options.inactivity) {
			// We squeeze options.inactivity between the min and max allowable values
			options.inactivity = [ Math.floor(toNumber(options.inactivity)), 
								   MAX_INACTIVITY, 
								   DEFAULT_INACTIVITY ].sort(dutil.num_cmp)[1];
		}
		else {
			options.inactivity = DEFAULT_INACTIVITY;
		}

		if (options.wait <= 0 || options.wait > options.inactivity) {
			options.wait = Math.floor(options.inactivity * 0.8);
		}

		options.window = WINDOW_SIZE;

		// There is just 1 inactivity timeout for the whole BOSH session
		// (as opposed to for each response as it was earlier)
		options.timeout = null;

		// This this BOSH session have a pending nextTick() handler?
		options.has_next_tick = false;

		return options;
	}

	// Begin session handlers
	// 
	// Ideally, the session_* functions shouldn't worry about anything except for 
	// session state maintenance. They should specifically NOT know about streams.
	// There may be some exceptions where the abstractions leak into one another, 
	// but they should be the exceptions (and there should be a good reason for 
	// such an occurence) and not the rule.
	// 
	function session_create(node) {
		var sid = uuid();
		var opt = {
			sid:        sid, 
			rid:        Math.floor(toNumber(node.attrs.rid)), 
			wait:       Math.floor(toNumber(node.attrs.wait)), 
			hold:       Math.floor(toNumber(node.attrs.hold)),
			// The 'inactivity' attribute is an extension
			inactivity: Math.floor(toNumber(node.attrs.inactivity || DEFAULT_INACTIVITY)), 
			content:    "text/xml; charset=utf-8"
		};

		if (opt.hold <= 0) {
			// Sanitize hold
			opt.hold = 1;
		}

		if (node.attrs.content) {
			// If the client included a content attribute, we mimic it.
			opt.content = node.attrs.content;
		}

		if (node.attrs.ack) {
			// If the client included an ack attribute, we support ACKs.
			opt.ack = 1;
		}

		if (node.attrs.route) {
			opt.route = node.attrs.route;
		}

		// The 'ua' attribute is an extension
		if (node.attrs.ua) {
			// The user-agent
			opt.ua = node.attrs.ua;
		}

		var state = new_state_object(opt);
		sid_state[sid] = state;
		++sid_info.length;
		++sid_info.total;
		return state;
	}

	function session_terminate(state, condition) {
		// 
		// Note: Even if we terminate a non-empty BOSH session, it is 
		// OKAY since the 'inactivity' timeout will eventually timeout
		// all open streams (on the XMPP server side)
		// 
		if (state.streams.length !== 0) {
			log_it("DEBUG", sprintfd("BOSH::%s::Terminating potentially non-empty BOSH session", state.sid));
		}

		save_terminate_condition_for_wait_time(terminated_sessions, state.sid, condition, state.wait);

		// We use get_response_object() since it also calls clearTimeout, etc...
		// for us for free.
		var ro = get_response_object(state);
		while (ro) {
			// To prevent an unhandled exception later
			ro.res.on('error', NULL_FUNC);
			ro.res.writeHead(200, HTTP_POST_RESPONSE_HEADERS);
			ro.res.end($body().toString());
			ro = get_response_object(state);
		}

		assert(state.res.length === 0);

		// Unset the inactivity timeout
		unset_session_inactivity_timeout(state);

		delete sid_state[state.sid];
		--sid_info.length;
	}


	// End session handlers


	// Begin stream handlers
	//
	// These functions don't communicate with either the Client
	// or the Connector. That is someone else's job. They just
	// update internal state for the operations being performed.
	//

	function stream_add(state, node) {
		var sname = uuid();
		var sstate = {
			name:       sname, 
			terminated: false, 
			to:         node.attrs.to, 
			state:      state
		};

		// Routs are specific to a stream, and not a session
		if (node.attrs.route) {
			sstate.route = route_parse(node.attrs.route);
		}

		if (node.attrs.from) {
			sstate.from = node.attrs.from;
		}

		state.streams.push(sname);

		sn_state[sname] = sstate;
		stat_stream_add();
		return sstate;
	}

	function get_streams_to_terminate(sstate, state) {
		// The streams to terminate. We start off we assuming that 
		// we have to terminate all streams on this session
		var streams = state.streams;

		// If we have a valid stream to terminate, then we reduce 
		// our set of streams to terminate to only this one
		if (sstate) {
			streams = [ sstate.name ];
		}

		// Streams to terminate
		var stt = streams.map(function(x) {
			return sn_state[x];
		}).filter(us.isTruthy);

		// Streams in error
		var sie = streams.map(function(x) {
			return sn_state[x];
		}).filter(us.isFalsy);

		// From streams, remove all entries that are 
		// null or undefined, and log this condition.
		if (sie.length > 0) {
			log_it("WARN", 
				sprintfd("BOSH::%s::get_streams_to_terminate::%s streams are in error", state.sid, sie.length)
			);
		}

		return stt;
	}

	function stream_terminate(stream, state, condition) {
		
		save_terminate_condition_for_wait_time(terminated_streams, stream.name, condition, state.wait);

		var sstream = sn_state[stream.name];
		if (sstream) {
			delete sn_state[stream.name];
			stat_stream_terminate();
		}
		var pos = state.streams.indexOf(stream.name);
		if (pos !== -1) {
			state.streams.splice(pos, 1);
		}
	}
	// End stream handlers


	function is_valid_packet(node, state) {
		/* Check the validity of the packet 'node' wrt the 
		 * state of the BOSH session 'state'. This mainly checks
		 * the 'sid' and 'rid' attributes.
		 * 
		 * Also limit the number of attributes in the <body> tag to 20
		 * 
		 */
		log_it("DEBUG", 
			sprintfd("BOSH::%s::is_valid_packet::node.attrs.rid:%s, state.rid:%s", 
				state.sid, node.attrs.rid, state.rid)
		);

		// Allow variance of "window" rids on either side. This is in violation
		// of the XEP though.
		return state && node.attrs.sid && node.attrs.rid && 
			node.attrs.rid > state.rid - state.window - 1 && 
			node.attrs.rid < state.rid + state.window + 1 && 
			Object.keys(node.attrs).length < 21;
	}

	function get_state(node) {
		/* Fetches a BOSH session state object given a BOSH stanza
		 * (<body> tag)
		 *
		 */
		var sid = node.attrs.sid;
		var state = sid ? sid_state[sid] : null;
		return state;
	}


	function add_held_http_connection(state, rid, res) {
		/* Adds the response object 'res' to the list of held response
		 * objects for the BOSH sessions represented by 'state'. Also 
		 * sets the associated 'rid' of the response object 'res' to 'rid'
		 *
		 */
		// If a client makes more connections than allowed, trim them.
		// http://xmpp.org/extensions/xep-0124.html#overactive
		//
		// This is currently not being enforced. See comment #001
		//
		// However, if the client specifies a 'hold' value greater than
		// 'MAX_BOSH_CONNECTIONS', then the session will be terminated 
		// because of the rule below.
		//

		if (state.res.length > MAX_BOSH_CONNECTIONS) {
			// Just send the termination message and destroy the socket.
			var _ro = {
				res: res, 
				timeout: null, 
				rid: rid // This is the 'rid' of the request associated with this response.
			};

			send_session_terminate(_ro, state, 'policy-violation');

			state.streams.forEach(function(name) {
				stream_terminate(name, state, 'policy-violation');
			});

			session_terminate(state, 'policy-violation');
			return;
		}

		// If a client closes a connection and a response to that HTTP request 
		// has not yet been sent, then the 'error' event is NOT raised by node.js.
		// Hence, we need not attach an 'error' event handler yet.

		// res.socket could be undefined if this request's socket is still in the 
		// process of sending the previous request's response. Either ways, we 
		// can be sure that setTimeout and setKeepAlive have already been called 
		// on this socket.
		if (res.socket) {
			// Increasing the timeout of the underlying socket to allow 
			// wait > 120 sec
			res.socket.setTimeout(state.wait * 1000 + 10);
			res.socket.setKeepAlive(true, HTTP_SOCKET_KEEPALIVE);
		}

		var ro;
		ro = {
			res: res, 
			rid: rid, // This is the 'rid' of the request associated with this response.
			// timeout the connection if no one uses it for more than state.wait sec.
			timeout: setTimeout(function() {
				var pos = state.res.indexOf(ro);
				if (pos === -1) {
					return;
				}
				// Remove self from list of held connections.
				state.res.splice(pos, 1);
				//
				// Send back an empty body element.
				// We don't add this to unacked_responses since it's wasteful. NO
				// WE ACTUALLY DO add it to unacked_responses
				//
				send_no_requeue(ro, state, $body());
			}, state.wait * 1000)
		};

		log_it("DEBUG", sprintfd("BOSH::%s::adding a response object. Holding %s response objects", 
			state.sid, state.res.length)
		);

		// Insert into its correct position (in RID order)
		var pos;
		for (pos = 0; pos < state.res.length && state.res[pos].rid < ro.rid; ++pos) { }

		state.res.splice(pos, 0, ro);
		return state;
	}

	function unset_session_inactivity_timeout(state) {
		/* Disables the BOSH session inactivity timeout */
		if (state.timeout) {
			clearTimeout(state.timeout);
			state.timeout = null;
		}
	}

	function reset_session_inactivity_timeout(state) {
		/* Resets the BOSH session inactivity timeout */
		if (state.timeout) {
			clearTimeout(state.timeout);
		}

		log_it("DEBUG", sprintfd("BOSH::%s::setting a timeout of '%s' sec", state.sid, state.inactivity + 10));

		state.timeout = setTimeout(function() {
			log_it("DEBUG", sprintfd("BOSH::%s::terminating BOSH session due to inactivity", state.sid));

			// Raise a no-client event on pending as well as unacked responses.
			var _p = us.pluck(state.pending, 'response');

			var _uar = Object.keys(state.unacked_responses).map(toNumber)
			.map(function(rid) {
				return state.unacked_responses[rid].response;
			});

			var all = _p.concat(_uar);
			all.forEach(function(response) {
				bep.emit('no-client', response);
			});

			// Pretend as if the client asked to terminate the stream
			unset_session_inactivity_timeout(state);
			handle_client_stream_terminate_request(null, state, [ ]);
		}, (state.inactivity + 10 /* 10 sec grace period */) * 1000);
	}

	function respond_to_extra_held_response_objects(state) {
		/* If the client has made more than "hold" connections 
		 * to us, then we relinquish the rest of the rest of the 
		 * connections
		 *
		 */
		while (state.res.length > state.hold) {
			log_it("DEBUG", 
				sprintfd("BOSH::In respond_to_extra_held_response_objects %s:: state res length: %s::state hold:%s", 
					state.sid, state.res.length, state.hold)
			);
			var ro = get_response_object(state);
			send_no_requeue(ro, state, $body());
		}

	}

	function is_bosh_session_state(state) {
		// This is downright ugly
		return !state.hasOwnProperty('state');
	}


	// Fetches a "held" HTTP response object that we can potentially
	// send responses to. This function accepts either a BOSH session
	// object OR a stream object.
	//
	function get_response_object(sstate /* or state */) {
		var state = is_bosh_session_state(sstate) ? sstate : sstate.state;

		var res = state.res;
		assert(res instanceof Array);

		var ro = res.length > 0 ? res.shift() : null;

		if (ro) {
			clearTimeout(ro.timeout);
			log_it("DEBUG", 
				sprintfd("BOSH::%s::Returning response object with rid: %s", state.sid, ro.rid)
			);
		}

		log_it("DEBUG", 
			sprintfd("BOSH::%s::Holding %s response objects", state.sid, (res ? res.length : 0))
		);

		return ro;
	}


	/* Begin Response Sending Functions */
	// 
	// These functions actually send responses to the client
	//
	function send_session_creation_response(sstate) {
		var state = sstate.state;

		// We _must_ get a response object. If we don't, there is something
		// seriously messed up. Log this.
		if (state.res.length === 0) {
			log_it('DEBUG', 
				   sprintfd("BOSH::%s::send_session_creation_response::Could not find a response object for stream:%s", 
							state.sid, sstate.name)
				  );
			return false;
		}

		var attrs = {
			stream:     sstate.name, 
			sid:        state.sid, 
			wait:       state.wait, 
			ver:        state.ver, 
			polling:    state.inactivity / 2, 
			inactivity: state.inactivity, 
			requests:   WINDOW_SIZE, 
			hold:       state.hold, 
			from:       sstate.to, 
			content:    state.content, 
			"xmpp:restartlogic": "true", 
			"xmlns:xmpp": 'urn:xmpp:xbosh', 
			// secure:     'false', // TODO
			// 'ack' is set by the client. If the client sets 'ack', then we also
			// do acknowledged request/response. The 'ack' attribute is set
			// by the send_no_requeue function since it is the last one to 
			// touch responses before they go out on the wire.
			"window":   WINDOW_SIZE // Handle window size mismatches
		};

		if (sstate.from) {
			// This is *probably* the JID of the user. Send it back as 'to'. 
			// This isn't mentioned in the spec.
			attrs.to = sstate.from;
		}

		var response = $body(attrs);

		enqueue_response(response, sstate);
	}

	function send_stream_add_response(sstate) {
		var state = sstate.state;
		var attrs = {
			stream:     sstate.name, 
			from:       sstate.to
		};

		if (sstate.from) {
			// This is *probably* the JID of the user. Send it back as 'to'. 
			// This isn't mentioned in the spec.
			attrs.to = sstate.from;
		}

		var response = $body(attrs);

		enqueue_response(response, sstate);
	}

	function send_stream_terminate_response(sstate, condition) {
		/* Terminates an open stream.
		 * 
		 * sstate: The stream state object
		 * condition: (optional) A string which specifies the condition to 
		 *     send to the client as to why the stream was closed.
		 *
		 */
		var state = sstate.state;

		var attrs = {
			stream:     sstate.name
		};
		if (condition) {
			// Set the condition so that listeners may be able to 
			// determine why this stream was terminated
			sstate.condition = condition;
			attrs.condition  = condition;
		}

		var response = $terminate(attrs);
		enqueue_response(response, sstate);

		// Mark the stream as terminated AFTER the terminate response has been queued.
		sstate.terminated = true;
	}

	// 
	// send_session_terminate() takes 'ro' as its first argument whereas
	// send_stream_terminate_response() does NOT because we might want to send a 
	// session termination response on certain error conditions that have
	// the 'ro' object with them already (i.e. it is not shift()ed from state.res)
	//
	function send_session_terminate(ro, state, condition) {
		/* Terminates an open BOSH session.
		 * 
		 * ro: The response object to use
		 * state: The stream state object
		 * condition: (optional) A string which specifies the condition to 
		 *     send to the client as to why the session was closed.
		 *
		 */

		log_it('DEBUG', sprintfd("BOSH::%s::send_session_terminate(%s, %s)", 
			state.sid, (!!ro), condition || '')
		);

		var attrs = { };
		if (condition) {
			attrs.condition = condition;
		}

		var response = $terminate(attrs);
		send_no_requeue(ro, state, response);
	}

	function get_statistics(res) {
		var stats = [ ];
		stats.push('<?xml version="1.0" encoding="utf-8"?>');
		stats.push('<!DOCTYPE html>');
		var content = new ltx.Element('html', {
			'xmlns':    'http://www.w3.org/1999/xhtml', 
			'xml:lang': 'en'
		})
			.c('head')
			.c('title').t('node-xmpp-bosh').up()
			.up()
			.c('body')
			.c('h1')
			.c('a', {'href': 'http://code.google.com/p/node-xmpp-bosh/'}).t('node-xmpp-bosh').up()
			.up()
			.c('h3').t('Bidirectional-streams Over Synchronous HTTP').up()
			.c('p').t(sprintf('Uptime: %s', dutil.time_diff(started, new Date()))).up()
			.c('p').t(sprintf('%s/%s active %s', sid_info.length, sid_info.total, 
							  dutil.pluralize(sid_info.total, 'session'))).up()
			.c('p').t(sprintf('%s/%s active %s', sn_info.length, sn_info.total, 
							  dutil.pluralize(sn_info.total, 'stream'))).up()
			.tree();
		stats.push(content.toString());
		return stats.join('\n');
	}

	/* End Response Sending Functions */

	function get_random_stream(state) {
		/* Fetches a random stream from the BOSH session. This is used to 
		 * send a sstate object to function that require one even though
		 * the particular response may have nothing to do with a stream
		 * as such.
		 */
		if (state.streams.length === 0) {
			var estr = sprintf("BOSH::%s::state object has no streams", state.sid);
			log_it("ERROR", estr);
			return null;
		}
		var sstate = sn_state[state.streams[0]];
		return sstate;
	}


	function send_termination_stanza(res, attrs) {
		/* Send a stream termination response on an HTTP response (res) object.
		 * This method is generally used to terminate rogue connections.
		 */

		attrs = attrs || { };

		res.writeHead(200, HTTP_POST_RESPONSE_HEADERS);
		res.end($terminate(attrs).toString());
	}

	function emit_nodes_event(nodes, state, sstate) {
		/* Raise the 'nodes' event on 'bep' for every node in 'nodes'.
		 * If 'sstate' is falsy, then the 'nodes' event is raised on 
		 * every open stream in the BOSH session represented by 'state'.
		 *
		 */
		if (!sstate) {
			// No stream name specified. This packet needs to be
			// broadcast to all open streams on this BOSH session.
			dutil.log_it("DEBUG", function() {
				return dutil.sprintf("BOSH::emitting nodes to all streams:No Stream Name specified:%s",nodes);
			});
			state.streams.forEach(function(sname) {
				var ss = sn_state[sname];
				if (ss) {
					bep.emit('nodes', nodes, ss);
				}
			});
		}
		else {
			dutil.log_it("DEBUG", function() {
				return dutil.sprintf("BOSH::%s:emitting nodes:%s",sstate.name, nodes);
			});			
			bep.emit('nodes', nodes, sstate);
		}
	}


	function on_no_client_found(response, sstate) {
		//
		// We add this response to the list of pending responses. 
		// If and when a new HTTP request on this BOSH session is detected, 
		// it will clear the pending response and send the packet 
		// (in FIFO order).
		//
		var _po = {
			response: response, 
			sstate: sstate
		};
		var state = sstate.state;
		state.pending.push(_po);
	}

	function send_immediate(res, response) {
		/* This function sends 'response' immediately. i.e. It does not 
		  * queue it up and this response may reach on an RID that is
		  * not in sequence.
		  */
		log_it("DEBUG", sprintfd("BOSH::send_immediate:%s", response));
		res.on('error', NULL_FUNC);
		res.writeHead(200, HTTP_POST_RESPONSE_HEADERS);
		res.end(response.toString());
	}

	function send_no_requeue(ro, state, response) {
		/* Send a response, but do NOT requeue if it fails */
		log_it("DEBUG", sprintfd("BOSH::%s::send_no_requeue, ro valid: %s", state.sid, us.isTruthy(ro)));

		if (us.isFalsy(ro)) {
			return;
		}

		log_it("DEBUG", sprintfd("BOSH::%s::send_no_requeue, rid: %s", state.sid, ro.rid));

		ro.res.on('error', NULL_FUNC);

		// If the client has enabled ACKs, then acknowledge the highest request
		// that we have received till now -- if it is not the current request.
		if (state.ack) {
			state.unacked_responses[ro.rid] = {
				response: response, 
				ts: new Date(), 
				rid: ro.rid
			};
			state.max_rid_sent = Math.max(state.max_rid_sent, ro.rid);

			if (ro.rid < state.rid) {
				response.attrs.ack = state.rid;
			}
		}

		var res_str = response.toString();
		log_it("DEBUG", sprintfd("BOSH::%s::send_no_requeue:writing response: %s", state.sid, res_str));

		// Allow Cross-Domain access
		// https://developer.mozilla.org/En/HTTP_access_control
		ro.res.writeHead(200, HTTP_POST_RESPONSE_HEADERS);

		ro.res.end(res_str);
	}


	function can_merge(response, pending) {
		/* Check if we can merge the XML stanzas in 'response' and some 
		 * response in 'pending'.
		 *
		 * The way this check is made is that all the attributes of the
		 * outer (body) element are checked, and if found equal, the
		 * two are said to be the equal.
		 *
		 * When 2 body tags are found to be equal, they can be merged, 
		 * and the position of the first such response in 'pending' 
		 * is returned.
		 *
		 * Since the only *special* <body> tag that is created for a
		 * stream before sending is the terminate response, we can 
		 * be sure that any response that has an XMPP payload is a
		 * plain-ol body tag and we will always merge with the right 
		 * response and responses will be in-order.
		 * 
		 */
		var i;
		for (i = 0; i < pending.length; ++i) {
			if (us.isEqual(response.attrs, pending[i].response.attrs)) {
				return i;
			}
		}
		return -1;
	}


	function merge_or_push_response(response, sstate) {
		var state = sstate.state;
		var merge_index = can_merge(response, state.pending);
		log_it('DEBUG', sprintfd('BOSH::%s::Merging with response at index: %s', state.sid, merge_index));

		if (merge_index !== -1) {
			// Yes, it is the same stream. Merge the responses.
			var _presp = state.pending[merge_index].response;

			response.children.forEach(function(child) {
				// 
				// Don't forget to reset 'parent' since reassigning
				// children w/o assigning the 'parent' can be
				// DISASTROUS!! You'll never know what hit you
				// 
				child.parent = _presp;
				_presp.children.push(child);
			});
		}
		else {
			state.pending.push({
				response: response, 
				sstate: sstate
			});
		}
	}

	function pop_and_send(state) {
		// There is a subtle bug here. If the sending of this response fails
		// then it is appended to the queue of pending responses rather than 
		// being added to the right place. This is because we rely on 
		// enqueue_response() to append it back to the list of pending 
		// responses.
		// 
		// We hope for this to not occur too frequently.
		//
		// The right way to do it would be to always stamp the response
		// with the 'rid' when sending and add it to the list of buffered
		// responses. However, in places with a bad network this will
		// degrade the experience for the client. Hence, we stick with
		// the current implementation.
		//

		var ro = get_response_object(state);

		log_it("DEBUG", 
			   sprintfd("BOSH::%s::pop_and_send: ro:%s, state.pending.length: %s", 
						state.sid, us.isTruthy(ro), state.pending.length)
			  );

		if (ro && state.pending.length > 0) {
			var _p        = state.pending.shift();
			var response  = _p.response;
			var sstate    = _p.sstate;

			// On error, try the next one or start the timer if there
			// is nothing left to try.
			ro.res.on('error', function() {
				log_it("DEBUG", sprintfd("BOSH::%s::error sending response on rid: %s", state.sid, ro.rid));

				if (state.res.length > 0) {
					// Try the next one
					enqueue_response(response, sstate);
				}
				else {
					on_no_client_found(response, sstate);
				}
			});

			send_no_requeue(ro, sstate.state, response);

			// We try sending more queued responses
			send_pending_responses(state);
		}
	}

	function enqueue_response(response, sstate) {
		/* Enqueue a response. Requeue if the sending fails.
		 * 
		 * This function tries to merge the response with an existing
		 * queued response to be sent on this stream (if merging them
		 * is feasible). Subsequently, it will pop the first queued 
		 * response to be sent on this BOSH session and try to send it.
		 * In the unfortunate event that it can NOT be sent, it will be
		 * added to the back to the queue (not the front). This can be
		 * the cause of very rare unordered responses.
		 * 
		 * If you see unordered responses, this bit needs to be fixed 
		 * to maintain state.pending as a priority queue rather than
		 * a simple array.
		 *
		 * Note: Just adding to the front of the queue will NOT work, 
		 * so don't even waste your time trying to fix it that way.
		 *
		 */

		// if (sstate.terminated) {
			// @taher.g Disable this check for now
			// return;
		// }

		var state = sstate.state;

		log_it("DEBUG", sprintfd("BOSH::%s::enqueue_response", state.sid));

		// Merge with an existing response, or push it as a new response
		merge_or_push_response(response, sstate);

		if (!state.has_next_tick) {
			process.nextTick(function() {
				state.has_next_tick = false;
				pop_and_send(state);
			});
			state.has_next_tick = true;
		}
	}

	function handle_client_stream_terminate_request(sstate, state, nodes, condition) {
		// This function handles a stream terminate request from the client.
		// It assumes that the client sent a stream terminate request. 
		// i.e. That the request is valid. If we use this to respond to an 
		// invalid request, we need to respond to that request separately.
		//
		// 'condition' is an optional parameter. If not specified, no condition
		// (reason) shall be sent in the terminate response
    
		var streams_to_terminate = get_streams_to_terminate(sstate, state);
		var will_terminate_all_streams = streams_to_terminate.length === state.streams.length;

		streams_to_terminate.forEach(function(sstate) {
			if (nodes.length > 0) {
				emit_nodes_event(nodes, state, sstate);
			}

			// Send stream termination response
			// http://xmpp.org/extensions/xep-0124.html#terminate
			if (!will_terminate_all_streams) {
				send_stream_terminate_response(sstate, condition);
			}

			stream_terminate(sstate, state, condition);
			bep.emit('stream-terminate', sstate);
		});


		// Terminate the session if all streams in this session have
		// been terminated.
		if (state.streams.length === 0) {
			//
			// Send the session termination response to the client.
			// Copy the condition if mentioned.
			//
			send_session_terminate(get_response_object(state), state, condition);

			// And terminate the rest of the held response objects.
			session_terminate(state, condition);
		}
	}

	function send_pending_responses(state) {
		log_it("DEBUG", 
			sprintfd("BOSH::%s::send_pending_responses::state.pending.length: %s", state.sid, state.pending.length)
		);

		if (state.pending.length > 0 && state.res.length > 0) {
			pop_and_send(state);
		}
	}



	// The BOSH event emitter. People outside will subscribe to
	// events from this guy. We return an instance of BoshEventPipe
	// to the outside world when anyone calls createServer()
	function BoshEventPipe(http_server) {
		this.server = http_server;
	}

	util.inherits(BoshEventPipe, EventPipe);

	dutil.copy(BoshEventPipe.prototype, {
		stop: function() {
			// console.log("stop::", http_server);
			return this.server.close();
		}, 
		sid_state: sid_state, 
		sn_state:  sn_state, 
		stat_stream_add: stat_stream_add, 
		stat_stream_terminate: stat_stream_terminate
	});


	// Create the http server
	var http_server = http.createServer(http_request_handler);

	http_server.on('error', function(ex) {
		// We enforce similar semantics as the rest of the node.js for the 'error'
		// event and throw an exception if it is unhandled
		if (!bep.emit('error', ex)) {
			throw new Error(
				sprintf('ERROR on listener at endpoint: http://%s:%s%s', options.host, options.port, options.path)
			);
		}
	});

	http_server.listen(options.port, options.host);


	var bep = new BoshEventPipe(http_server);

	// When the Connector is able to add the stream, we too do the same and 
	// respond to the client accordingly.
	bep.on('stream-added', function(sstate) {
		log_it("DEBUG", sprintfd("BOSH::%s::stream-added: %s", sstate.state.sid, sstate.name));
		var state = sstate.state;

		// Send only if this is the 2nd (or more) stream on this BOSH session.
		// This should work all the time. If anyone finds a case where it will
		// NOT work, please do let me know.
		if (state.streams.length > 1) {
			send_stream_add_response(sstate);
		}
	});

	// When a respone is received from the connector, try to send it out to the 
	// real client if possible.
	bep.on('response', function(connector_response, sstate) {
		log_it("DEBUG", sprintfd("BOSH::%s::%s::response: %s", sstate.state.sid, sstate.name, connector_response));
		var response = $body({
			stream:     sstate.name
		}).cnode(connector_response).tree();

		enqueue_response(response, sstate);
	});

	// This event is raised when the server terminates the connection.
	// The Connector typically raises this even so that we can tell
	// the client (user) that such an event has occurred.
	bep.on('terminate', function(sstate, error) {
		// We send a terminate response to the client.
		var response = $terminate({ stream: sstate.name });
		var state = sstate.state;
		
		var condition = error ? error : '';
		
		stream_terminate(sstate, state, condition);
		enqueue_response(response, sstate);

		send_stream_terminate_response(sstate, condition);

		// Should we terminate the BOSH session as well?
		if (state.streams.length === 0) {
			send_session_terminate(get_response_object(state), state, condition);
			session_terminate(state, condition);
		}
	});


	function process_bosh_request(res, node) {
		var state  = get_state(node);
		var sstate = null;

		// This will eventually contain all the nodes to be processed.
		var nodes = [ ];

		// Handle the stanza that the client sent us.

		// Check if this is a session start packet.
		if (is_session_creation_packet(node)) {
			log_it("DEBUG", "BOSH::Session creation");
			state  = session_create(node);
			add_held_http_connection(state, node.attrs.rid, res);

			sstate = stream_add(state, node);
			nodes  = node.children;

			reset_session_inactivity_timeout(state);

			// Respond to the client.
			send_session_creation_response(sstate);

			bep.emit('stream-add', sstate);

			// NULL out res so that it is not added again
			res = null;
		}
		else {
			var sname = node.attrs.stream;

			try  {
				// This is enclosed in a try/catch block since invalid requests
				// at this point MAY not have these attributes
				log_it("DEBUG", 
					sprintfd("BOSH::%s::RID: %s, state.RID: %s", state.sid, node.attrs.rid, state.rid)
				);
			}
			catch (ex) { }


			if (!state) {
				// No (valid) session ID in BOSH request. Not phare enuph.
				var terminate_condition;
				if (terminated_sessions[node.attrs.sid]) {
					terminate_condition = terminated_sessions[node.attrs.sid].condition;
				}
				
				send_termination_stanza(res, {
					condition: terminate_condition || 'item-not-found', 
					message:   terminate_condition ? '' : 'Invalid session ID'
				});
				
				return;
			}

			// Are we the only stream for this BOSH session?
			if (state.streams.length === 1) {
				// Yes, we are. Let's pretend that the stream name came along
				// with this request. This is mentioned in the XEP.
				sstate = sn_state[state.streams[0]];
			}

			// Check the validity of the packet and the BOSH session
			//
			// is_valid_packet() handles the rid range checking
			//
			if (!is_valid_packet(node, state)) {
				log_it("WARN", sprintfd("BOSH::%s::NOT a Valid packet", state.sid));

				var attrs = {
					condition: 'item-not-found', 
					message: 'Invalid packet'
				};
				if (node.attrs.stream) {
					attrs.stream = node.attrs.stream;
				}

				// Terminate the session (thanks @satyam.s). The XEP mentions this as
				// a MUST, so we humbly comply
				handle_client_stream_terminate_request(null, state, [ ], 'item-not-found');
				send_termination_stanza(res, attrs);
				return;
			}


			// Reset the BOSH session timeout
			reset_session_inactivity_timeout(state);

			// Set the current rid to the max. RID we have received till now.
			// state.rid = Math.max(state.rid, node.attrs.rid);

			node.attrs.rid = toNumber(node.attrs.rid);
			state.queued_requests[node.attrs.rid] = node;

			// Process all queued requests
			var _queued_request_keys = Object.keys(state.queued_requests).map(toNumber);
			_queued_request_keys.sort(dutil.num_cmp);

			_queued_request_keys.forEach(function(rid) {
				if (rid === state.rid + 1) {
					// This is the next logical packet to be processed.
					nodes = nodes.concat(state.queued_requests[rid].children);
					delete state.queued_requests[rid];

					// Increment the 'rid'
					state.rid += 1;
					log_it("DEBUG", sprintfd("BOSH::%s::updated RID to: %s", state.sid, state.rid));
				}
			});

			// Alternatively, we can also call ourselves recursively to process
			// the pending queue. That way, we won't need to sort() the pending 
			// queue. Think about it...


			// Has the client enabled ACKs?
			if (state.ack) {
				/* Begin ACK handling */

				var _uar_keys = Object.keys(state.unacked_responses).map(toNumber);
				if (_uar_keys.length > WINDOW_SIZE * 4 /* We are fairly generous */) {
					// The client seems to be buggy. It has not ACKed the
					// last WINDOW_SIZE * 4 requests. We turn off ACKs.
					delete state.ack;

					log_it("WARN", sprintfd("BOSH::%s::disabling ACKs", state.sid));

					state.unacked_responses = { };
				}

				if (!node.attrs.ack) {
					// Assume that all requests up to rid-1 have been responded to
					// http://xmpp.org/extensions/xep-0124.html#rids-broken
					node.attrs.ack = state.rid - 1;
				}

				if (node.attrs.ack) {
					// If the request from the client includes an ACK, we delete all
					// packets with an 'rid' less than or equal to this value since
					// the client has seen all those packets.
					_uar_keys.forEach(function(rid) {
						if (rid <= node.attrs.ack) {
							// Raise the 'response-acknowledged' event.
							bep.emit('response-acknowledged', state.unacked_responses[rid], state);
							delete state.unacked_responses[rid];
						}
					});
				}

				// And has not acknowledged the receipt of the last message we sent it.
				if (node.attrs.ack && 
					node.attrs.ack < state.max_rid_sent && 
					state.unacked_responses[node.attrs.ack]) {
						var _ts = state.unacked_responses[node.attrs.ack].ts;

						var ss = sstate || get_random_stream(state);
						if (!ss) {
							var estr = sprintf("BOSH::%s::ss is invalid", state.sid);
							log_it("ERROR", estr);
						}
						else {
							// We inject a response packet into the pending queue to 
							// notify the client that it _may_ have missed something.
							state.pending.push({
								response: $body({
									report: node.attrs.ack + 1, 
									time: new Date() - _ts
								}), 
								sstate: ss
							});
						}
				}

				// 
				// Handle the condition of broken connections
				// http://xmpp.org/extensions/xep-0124.html#rids-broken
				// 
				// We only handle broken connections for streams that have
				// acknowledgements enabled.
				// 
				// We MUST respond on this same connection - We always have 
				// something to respond with for any request with an rid that
				// is less than state.rid + 1
				//
				_queued_request_keys = Object.keys(state.queued_requests).map(toNumber);
				_queued_request_keys.sort(dutil.num_cmp);
				var quit_me = false;

				_queued_request_keys.forEach(function(rid) {
					// 
					// There should be exactly 1 'rid' in state.queued_requests that is 
					// less than state.rid+1
					// 
					if (rid < state.rid + 1) {
						log_it("DEBUG", sprintfd("BOSH::%s::qr-rid: %s, state.rid: %s", state.sid, rid, state.rid));

						delete state.queued_requests[rid];

						if (state.unacked_responses.hasOwnProperty(rid)) {
							//
							// Send back the original response on this conection itself
							//
							log_it("DEBUG", sprintfd("BOSH::%s::re-sending unacked response: %s", state.sid, rid));
							send_immediate(res, state.unacked_responses[rid].response);
							quit_me = true;
						}
						else if (rid >= state.rid - state.window - 2)
						{
							//
							// Send back an empty body since it is within the range. We assume
							// that we didn't send anything on this rid the first time around.
							//
							// There is a small issue here. If a client re-sends a request for
							// an 'rid' that it has already acknowledged, it will get an empty
							// body the second time around. The client is to be blamed for its 
							// stupidity and not us.
							//
							log_it("DEBUG", sprintfd("BOSH::%s::sending empty BODY for: %s", state.sid, rid));
							send_immediate(res, $body());
							quit_me = true;
						}
						else {
							//
							// Terminate this session. We make the rest of the code believe
							// that the client asked for termination.
							//
							// I don't think that control will ever reach here since the 
							// validation for the 'rid' being in a permissible range has
							// already been made.
							//
							// Note: Control DOES reach here. We need to figure out WHY.
							//
							dutil.copy(node.attrs, {
								type: 'terminate', 
								condition: 'item-not-found', 
								xmlns: BOSH_XMLNS
							});
						}
					}
				});

				if (quit_me) {
					return;
				}

				/* End ACK handling */
			}

			// 
			// We handle this condition right at the end so that RID updates
			// can be processed correctly. If only the stream name is invalid, 
			// we treat this packet as a valid packet (only as far as updates
			// to 'rid' are concerned)
			// 
			if (sname) {
				// The stream name is included in the BOSH request.
				sstate = sn_state[sname];

				// If the stream name is present, but the stream is not valid, we
				// blow up.
				if (!sstate) {
					// FIXME: Subtle bug alert: We have implicitly ACKed all 
					// 'rids' till now since we didn't send an 'ack'

					var terminate_condition;
					if (terminated_streams[sname]) {
						terminated_condition = terminated_streams[sname].condition;
					}

					send_termination_stanza(res, {
						condition: terminate_condition || 'item-not-found', 
						message: terminate_condition? '' : 'Invalid stream name', 
						stream: sname
					});
					return;
				}
			}


			// Add to held response objects for this BOSH session
			add_held_http_connection(state, node.attrs.rid, res);

			// Process pending (queued) responses (if any)
			send_pending_responses(state);

			// Should we process this packet?
			if (node.attrs.rid > state.rid) {
				// Not really... The request will remain in queued_requests 
				// and the response object has already been held
				log_it("INFO", sprintfd("BOSH::%s::not processing packet: %s", state.sid, node));
				return;
			}


			// Check if this is a stream restart packet.
			if (is_stream_restart_packet(node)) {
				log_it("DEBUG", sprintfd("BOSH::%s::Stream Restart", state.sid));

				if (node.attrs.stream_attrs) {
					sstate.attrs = dutil.json_parse(node.attrs.stream_attrs, { });
				}

				// Check if sstate is valid
				if (!sstate) {
					// Make this a session terminate request.
					node.attrs.type = 'terminate';
					delete node.attrs.stream;
				}
				else {
					bep.emit('stream-restart', sstate);
				}
				// According to http://xmpp.org/extensions/xep-0206.html
				// the XML nodes in a restart request should be ignored.
				// Hence, we comply.
				nodes = [ ];
			}

			// Check if this is a new stream start packet (multiple streams)
			else if (is_stream_add_request(node)) {
				log_it("DEBUG", sprintfd("BOSH::%s::Stream Add", state.sid));

				if (state.streams.length > MAX_STREAMS_PER_SESSION) {
					// Make this a session terminate request.
					node.attrs.type      = 'terminate';
					node.attrs.condition = 'policy-violation';
					delete node.attrs.stream;
				}
				else {
					sstate = stream_add(state, node);

					// Don't yet respond to the client. Wait for the 'stream-added' event
					// from the Connector.
					bep.emit('stream-add', sstate);
				}
			}

			// Check for stream terminate
			if (is_stream_terminate_request(node)) {
				log_it("DEBUG", sprintfd('BOSH::%s::Stream Terminate', state.sid));

				// We may be required to terminate one stream, or all
				// the open streams on this BOSH session.

				handle_client_stream_terminate_request(sstate, state, nodes, node.attrs.condition);

				// Once a stream is terminated, there is no point sending 
				// nodes. Which is why we did the needful before sending
				// the terminate event.
				nodes = [ ];
			}

		} // else (not session start)

		// 
		// In any case, we should process the XML nodes.
		// 
		if (nodes.length > 0) {
			emit_nodes_event(nodes, state, sstate);
		}

		// Comment #001
		//
		// Respond to any extra "held" response objects that we actually 
		// should not be holding on to (Thanks Stefan)
		//
		// This is in disagreement with the XEP
		// http://xmpp.org/extensions/xep-0124.html#overactive
		// if the client sent an empty <body/> tag and was overactive
		//
		// However, we do it since many flaky clients and network 
		// configurations exist in the wild.
		//
		respond_to_extra_held_response_objects(state);
	}


	function xml_parse_and_get_body_tag(data) {
		// Wrap data in <dummy> tags to prevent the billion laughs 
		// (XML entity expansion) attack
		// http://www.stylusstudio.com/xmldev/200211/post50610.html
		var node = dutil.xml_parse('<dummy>' + data + '</dummy>');

		if (!node || node.children.length !== 1 || 
			typeof node.children[0].is !== 'function' || 
			!node.children[0].is('body')) {
			return null;
		}
		return node.children[0];
	}


	function bosh_requst_handler(res, data) {
		/* Called when the 'end' event for the request is fired by 
		 * the HTTP request handler
		 */

		var node = xml_parse_and_get_body_tag(data);

		if (!node) {
			res.writeHead(200, HTTP_POST_RESPONSE_HEADERS);
			res.end($terminate({ condition: 'bad-request' }).toString());
			return;
		}

		log_it("DEBUG", sprintfd("BOSH::Processing request: %s", node));

		process_bosh_request(res, node);
	}


	// All request handlers return 'false' on successful handling
	// of the request and 'undefined' if they did NOT handle the
	// request. This is according to the EventPipe listeners API
	// expectation.
	function handle_options(req, res, u) {
		if (req.method === 'OPTIONS') {
			res.writeHead(200, HTTP_OPTIONS_RESPONSE_HEADERS);
			res.end();
			return false;
		}
	}

	function handle_get_favicon(req, res, u) {
		if (req.method === 'GET' && u.pathname === '/favicon.ico') {
			res.writeHead(303, {
				'Location': 'http://xmpp.org/favicon.ico'
			});
			res.end();
			return false;
		}
	}

	function handle_get_statistics(req, res, u) {
		var ppos = u.pathname.search(options.path);
		if (req.method === 'GET' && ppos !== -1 && !u.query.hasOwnProperty('data')) {
			res.writeHead(200, HTTP_GET_RESPONSE_HEADERS);
			var stats = get_statistics();
			res.end(stats);
			return false;
		}
	}

	function handle_get_bosh_request(req, res, u) {
		var ppos = u.pathname.search(options.path);
		if (req.method === 'GET' && ppos !== -1 && u.query.hasOwnProperty('data')) {
			res = new JSONPResponseProxy(req, res);
			bosh_requst_handler(res, u.query.data || '');
			return false;
		}
	}

	function handle_unhandled_request(req, res, u) {
		log_it("ERROR", "BOSH::Invalid request, method:", req.method, "path:", u.pathname);
		var _headers = { };
		dutil.copy(_headers, HTTP_POST_RESPONSE_HEADERS);
		_headers['Content-Type'] = 'text/plain; charset=utf-8';
		res.writeHead(404, _headers);
		res.end();
		return false;
	}

	function handle_post_bosh_request(req, res, u) {
		var ppos = u.pathname.search(options.path);
		if (req.method !== 'POST' || ppos === -1) {
			return;
		}

		var data = [];
		var data_len = 0;

		var _on_end_callback = us.once(function(timed_out) {
			if (timed_out) {
				log_it("WARN", "BOSH::Timing out (and destroying) connection from '" + req.socket.remoteAddress + "'");
				req.destroy();
			}
			else {
				bosh_requst_handler(res, data.join(''));
				clearTimeout(end_timeout);
			}
		});

		// Timeout the request of we don't get an 'end' event within
		// 20 sec of the request being made.
		var end_timeout = setTimeout(function() {
			_on_end_callback(true);
		}, 20 * 1000);

		//
		// Seriously consider naming all callbacks - rejected
		// Why? because it involves 'naming' functions. Why name when
		// you can get away with not naming them?
		//
		req.on('data', function(d) {
			var _d = d.toString();
			data_len += _d.length;

			// Prevent attacks. If data (in its entirety) gets too big, 
			// terminate the connection.
			if (data_len > MAX_DATA_HELD) {
				// Terminate the connection. We null out 'data' to aid GC
				data = null;
				_on_end_callback(true);
				return;
			}

			data.push(_d);
		})

		.on('end', function() {
			_on_end_callback(false);
		})

		.on('error', function(ex) {
			log_it("WARN", "BOSH::Exception '" + ex.toString() + "' while processing request");
			log_it("WARN", "BOSH::Stack Trace:\n", ex.stack);
		});

		return false;
	}

	var router = new EventPipe();
	router.on('request', handle_post_bosh_request, 1)
		.on('request', handle_get_bosh_request, 2)
		.on('request', handle_options, 3)
		.on('request', handle_get_favicon, 4)
		.on('request', handle_get_statistics, 5)
		.on('request', handle_unhandled_request, 6);


	function http_request_handler(req, res) {
		var u = url.parse(req.url, true);

		//
		// Q. Why not create named functions that express intent 
		// and call them sequentially?
		// 
		// A. Because that significantly complicates code and using 
		// 'return;' in those function doesn't return control from 
		// the current function.
		// 
		// @Vishnu Now that this handler has become sufficiently 
		// complex, this seems to be a really good idea.
		//

		log_it("DEBUG", sprintfd("BOSH::Processing '%s' request at location: %s", 
								 req.method, u.pathname)
			  );

		router.emit('request', req, res, u);
	}


/*
	setInterval(function() {
	    Object.keys(sid_state).forEach(function(sid) {
			console.log("sid:", sid, "pending:", sid_state[sid].pending.length, "responses:", sid_state[sid].res.length);
		})
	}, 20000);
*/

	return bep;

};


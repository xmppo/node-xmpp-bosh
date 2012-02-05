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
var ws     = require('websocket-server');
var ltx    = require('ltx');
var util   = require('util');
var uuid   = require('node-uuid');
var dutil  = require('./dutil.js');
var us     = require('underscore');
var assert = require('assert').ok;
var EventPipe = require('eventpipe').EventPipe;

var path        = require('path');
var filename    = "[" + path.basename(path.normalize(__filename)) + "]";
var log         = require('./log.js').getLogger(filename);

var sprintf  = dutil.sprintf;
var sprintfd = dutil.sprintfd;
var log_it   = dutil.log_it;

const STREAM_UNOPENED = 1;
const STREAM_OPENED   = 2;


// 
// Important links:
// 
// Draft Websocket protocol specification
// http://tools.ietf.org/html/draft-moffitt-xmpp-over-websocket-00
// 
// Strophe.js modified for Websocket support
// https://github.com/superfeedr/strophejs/tree/protocol-ed
//

exports.createServer = function(bosh_server) {

	// State information for XMPP streams
	var sn_state = { };

	function WebSocketEventPipe(bosh_server) {
		this.bosh_server = bosh_server;
	}

	util.inherits(WebSocketEventPipe, EventPipe);

	dutil.copy(WebSocketEventPipe.prototype, {
		stop: function() {
			return websocket_server.close();
		}, 
		stat_stream_add: function() {
			return this.bosh_server.stat_stream_add();
		}, 
		stat_stream_terminate: function() {
			return this.bosh_server.stat_stream_terminate();
		}
	});

	var wsep = new WebSocketEventPipe(bosh_server);

	var websocket_server = ws.createServer({
		server: bosh_server.server, 
		subprotocol: 'xmpp'
	});

	wsep.server = websocket_server;

	wsep.on('stream-added', function(sstate) {
		var to = sstate.to || '';
		var ss_xml = new ltx.Element('stream:stream', {
			'xmlns': 'jabber:client', 
			'xmlns:stream': 'http://etherx.jabber.org/streams', 
			'version': '1.0', 
			'xml:lang': 'en', 
			'from': to
		}).toString();
		sstate.conn.send(ss_xml);
	});

	wsep.on('response', function(response, sstate) {
		// Send the data back to the client

		// TODO: Handle send() failed
		sstate.conn.send(response.toString());
	});

	wsep.on('terminate', function(sstate, had_error) {
		if (!sn_state.hasOwnProperty(sstate.name)) {
			return;
		}
		delete sn_state[sstate.name];

		// Note: Always delete before closing
		// TODO: Handle close() failed
		sstate.conn.close();
	});

	websocket_server.on('connection', function(conn) {
		var stream_name = uuid();

		// Note: xmpp-proxy.js relies on the session object
		// to have a sid attribute and the stream object to
		// contain a name attribute. This is done to improve
		// readability of the logs, even though it introduces
		// coupling. We may choose to get rid of it later.
		// Deviation from this behaviour for now might lead to
		// a crash or unreadable logs.

		var sstate = {
			name: stream_name, 
			stream_state: STREAM_UNOPENED, 
			conn: conn, 
			// Compatibility with xmpp-proxy-connector
			state: {
				sid: "WEBSOCKET"
			},
			session: {
				sid: "WEBSOCKET"
			}
		};
		sn_state[stream_name] = sstate;

		conn.on('message', function(message) {
			message = '<dummy>' + message + '</dummy>';
			log.debug("%s - Processing: %s", stream_name, message);

			// XML parse the message
			var nodes = dutil.xml_parse(message);
			if (!nodes) {
				log.warn("%s Closing connection due to invalid packet", stream_name);
				sstate.conn.close();
				return;
			}

			// console.log("xml nodes:", nodes);
			nodes = nodes.children;

			// The stream start node is special since we trigger a stream-add
			// event when we get it.
			var ss_node = nodes.filter(function(node) {
				return typeof node.is === 'function' && node.is('stream');
			});

			ss_node = us.first(ss_node);

			nodes = nodes.filter(function(node) {
				return typeof node.is === 'function' ? !node.is('stream') : true;
			});

			if (ss_node) {
				if (sstate.stream_state === STREAM_UNOPENED) {
					// Start a new stream
					wsep.stat_stream_add();
					sstate.stream_state = STREAM_OPENED;
					// console.log("stream start attrs:", ss_node.attrs);

					sstate.to = ss_node.attrs.to;
					wsep.emit('stream-add', sstate, ss_node.attrs);
				}
				else if (sstate.stream_state === STREAM_OPENED) {
					// Restart the current stream
					wsep.emit('stream-restart', sstate, ss_node.attrs);
				}
			}

			// console.log("nodes:", nodes);
			assert(nodes instanceof Array);

			// Process the nodes normally.
			wsep.emit('nodes', nodes, sstate);
		});

		conn.on('close', function() {
			log.debug("%s Stream close requested", stream_name);

			if (!sn_state.hasOwnProperty(stream_name)) {
				// Already terminated
				return;
			}

			wsep.stat_stream_terminate();
			delete sn_state[stream_name];

			// Note: Always delete before emitting events

			// Raise the stream-terminate event on wsep
			wsep.emit('stream-terminate', sstate);
		});

	});
	
	websocket_server.on('disconnect', function(conn) {
	});

	function emit_error(ex) {
		// We enforce similar semantics as the rest of the node.js for the 'error'
		// event and throw an exception if it is unhandled
		if (!wsep.emit('error', ex)) {
			throw new Error(ex.toString());
		}
	}

	// Handle the 'error' event on the bosh_server and re-emit it. 
	// Throw an exception if no one handles the exception we threw
	bosh_server.on('error', emit_error);
	websocket_server.on('error', emit_error);

	return wsep;
};

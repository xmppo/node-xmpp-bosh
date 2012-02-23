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


var bosh      = require('./bosh.js');
var websocket = require('./websocket.js');
var websocket_draft10 = require('./websocket_draft10.js');
var dutil     = require('./dutil.js');
var xpc       = require('./xmpp-proxy-connector.js');
var xp        = require('./xmpp-proxy.js');
var ls        = require('./lookup-service.js');
var us        = require('underscore');
var path   = require('path');

var filename    = "[" + path.basename(path.normalize(__filename)) + "]";
var logger      = require('./log.js');
var log         = logger.getLogger(filename);

exports.bosh       = bosh;
exports.connector  = xpc;
exports.proxy      = xp;
exports.lookup     = ls;
exports.dutil      = dutil;
var webrepl     = require('webrepl');

exports.start_bosh = function(options) {

	options = options || { };
	options = dutil.extend(options, {
		path: /^\/http-bind(\/+)?$/, 
		port: 5280, 
		logging: "INFO"
	});

	logger.set_log_level(options.logging);
    var repl = webrepl.start(8888);
	// Instantiate a bosh server with the connector as a parameter.
	var bosh_server = bosh.createServer(options, repl);
    var ltx = require("ltx");
    bosh_server.on('stream-add', function (stream) {
        bosh_server.emit('stream-added', stream);
        var features = ltx.parse('<stream:features version="1.0" xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams"><mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><mechanism>PLAIN</mechanism><mechanism>DIGEST-MD5</mechanism><mechanism>PLAIN-PW-TOKEN</mechanism></mechanisms></stream:features>');
        bosh_server.emit("response", features, stream);
    });
    
    bosh_server.on('nodes', function (nodes, sstate) {
        // log.debug(sstate.name + " nodes");

        var isAuth = function (node) {
            return node.is("auth");
        };

        if (nodes.filter(isAuth).length) {
            var success = ltx.parse('<success xmlns="urn:ietf:params:xml:ns:xmpp-sasl" version="1.0" xmlns:stream="http://etherx.jabber.org/streams"/>');
            bosh_server.emit('response', success, sstate);
        } else {
            nodes.forEach(function (node) {
                bosh_server.emit('response', node, sstate);
            });
        }
    });
	// log.trace("Starting the BOSH server");

	// The connector is responsible for communicating with the real XMPP server.
	// We allow different types of connectors to exist.
	// var conn = new xpc.Connector(bosh_server, options);

    // repl.context.xpc = conn;
    
	//
	// Responses we may hook on to:
	// 01. stream-add
	// 02. stream-terminate (when the user terminates the stream)
	// 03. stream-restart
	// 04. no-client
	// 05. response-acknowledged
	// 06. nodes (from user to server)
	// 07. response (from server to user)
	// 08. terminate (when the server terminates the stream)
	// 09. stream-added (when the XMPP server starts a <stream:stream>
	// 10. error: Will throw an unhandled exception if the 'error' event is not handled
	//

	// Example:
	bosh_server.on("response-acknowledged", function(wrapped_response, session) {
		// What to do with this response??
        // log.trace("%s Response Acknowledged: %s", session.sid, wrapped_response.rid);
	});

	return bosh_server;
};

exports.start_websocket = function(bosh_server) {
	var ws_server = websocket.createServer(bosh_server);

	// The connector is responsible for communicating with the real XMPP server.
	// We allow different types of connectors to exist.
	var conn = new xpc.Connector(ws_server, { });

};

exports.start_websocket_draft10 = function(bosh_server) {
	var ws_server_draft10 = websocket_draft10.createServer(bosh_server);

	// The connector is responsible for communicating with the real XMPP server.
	// We allow different types of connectors to exist.
	var conn = new xpc.Connector(ws_server_draft10, { });

};

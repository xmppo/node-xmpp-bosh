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


var bosh  = require('./bosh.js');
var dutil = require('./dutil.js');
var xpc   = require('./xmpp-proxy-connector.js');
var xp    = require('./xmpp-proxy.js');
var ls    = require('./lookup-service.js');
var us    = require('underscore');


exports.bosh      = bosh;
exports.connector = xpc;
exports.proxy     = xp;
exports.lookup    = ls;
exports.start     = function(options) {

	options = options || { };
	options = dutil.extend(options, {
		path: /^\/http-bind\/$/, 
		port: 5280, 
		logging: "INFO"
	});

	dutil.set_log_level(options.logging);

	// Instantiate a bosh server with the connector as a parameter.
	var bosh_server = bosh.createServer(options);

	dutil.log_it("DEBUG", "bosh_server:", bosh_server);

	// The connector is responsible for communicating with the real XMPP server.
	// We allow different types of connectors to exist.
	var conn = new xpc.Connector(bosh_server);



	bosh_server.on('error', function(e) {
		dutil.log_it("ERROR", "Could not create the BOSH server:", e);
	});

	bosh_server.on('stanzas', function(stanzas, sstate) {
		stanzas = stanzas.filter(dutil.not(us.isString));
		stanzas.forEach(function(stanza) {
			conn.stanza(stanza, sstate);
		});
	});

	bosh_server.on('stream-add', function(sstate) {
		conn.stream_add(sstate);
	});

	bosh_server.on('stream-restart', function(sstate) {
		conn.stream_restart(sstate);
	});

	bosh_server.on('stream-terminate', function(sstate) {
		conn.stream_terminate(sstate);
	});

	bosh_server.on('no-client', function(response) {
		conn.no_client(response);
	});

	bosh_server.on('response-acknowledged', function(response) {
		conn.response_acknowledged(response);
	});

	bosh_server.on('response', function(response, sstate) {
		// Raised when the XMPP server sends the BOSH server a response to
		// send back to the client.
	});

	return bosh_server;
};

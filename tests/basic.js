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

// var BOSH_SERVICE = 'http://bosh.metajack.im:5280/xmpp-httpbind'
var options = { };
var conn = null;

var strophe = require("../strophe/strophe.js").Strophe;
var dutil   = require("../src/dutil.js");

var Strophe = strophe.Strophe;
var $iq     = strophe.$iq;
var $msg    = strophe.$msg;
var $build  = strophe.$build;
var $pres   = strophe.$pres;


function disconnect() {
    conn.disconnect();
}


function connect(options) {
    conn = new Strophe.Connection(options.endpoint);
    conn.rawInput = rawInput;
    conn.rawOutput = rawOutput;
	conn.connect(options.username, options.password, onConnect, null, null, options.route);
}

function onConnect(status)
{
	console.log("onConnect:", status, dutil.rev_hash(Strophe.Status)[status]);

    if (status == Strophe.Status.CONNECTING) {
		log('Strophe is connecting.');
    } else if (status == Strophe.Status.CONNFAIL) {
		log('Strophe failed to connect.');
		process.exit(1);
    } else if (status == Strophe.Status.AUTHFAIL) {
		log('Strophe failed to authenticate.');
		process.exit(1);
    } else if (status == Strophe.Status.DISCONNECTING) {
		log('Strophe is disconnecting.');
    } else if (status == Strophe.Status.DISCONNECTED) {
		log('Strophe is disconnected.');
		process.exit(0);
	} else if (status == Strophe.Status.CONNECTED) {
		log('Strophe is connected.');
		disconnect();
    }
}

function main() {
	var opts = require('tav').set({
		username: {
			note: 'The username to login as', 
		}, 
		password: {
			note: 'The password to use', 
		}, 
		endpoint: {
			note: 'The BOSH service endpoint (default: http://localhost:5280/http-bind/)', 
			value: 'http://localhost:5280/http-bind/'
		}, 
		route: {
			note: 'The route attribute to use (default: <empty>)', 
			value: ''
		}
	});

	options = opts;
	connect(options);
}

function log(msg) 
{
	console.log(msg);
}

function rawInput(data)
{
	console.log("\nReceived:", data);
}

function rawOutput(data)
{
	console.log("\nSent:", data);
}

// GO!!
main();

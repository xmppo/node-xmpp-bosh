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

var dutil = require("../src/dutil.js");
var ltx   = require('ltx');
var http  = require('http');
var url   = require('url');
var util  = require('util');

var options = { };

var BOSH_XMLNS = 'http://jabber.org/protocol/httpbind';


function http_request(options, cb) {
    var body = options.body;
    delete options.body;

    var r = http.request(options, function(res) {
		var data = '';
		// console.log("RES:", res);

		res.on('data', function(d) {
			data += d.toString();
		}).on('end', function() {
			cb(false, data);
		}).on('error', function() {
			cb(true);
		});
    });

    r.on('error', function() {
		cb(true);
    });

	r.setHeader("Connection", "Keep-Alive");
	// console.log("REQ:", r);

    r.end(body);
	return r;
}

function xml_http_request(options, cb) {
	return http_request(options, function(err, response) {
		if (!err) {
			response = dutil.xml_parse(response);
		}
		cb(err, response);
	});
}


function do_test(domain, route) {
    var rid = 5292811;
    var sid = null;

    var sess_create_attrs = {
		to: domain, 
		rid: rid++, 
		hold: 1, 
		ver: '1.6', 
		'xmpp:version': '1.0', 
		wait: '60', 
		'xml:lang': 'en', 
		'xmlns:xmpp': 'urn:xmpp:xbosh', 
		xmlns: BOSH_XMLNS
    };

    if (route) {
		sess_create_attrs.route = route;
    }

    var sess_create = new ltx.Element('body', sess_create_attrs);
    var u = url.parse(options.endpoint);

    var http_request_options = {
		host: u.hostname, 
		port: u.port, 
		path: u.pathname, 
		method: 'POST', 
		body: sess_create.toString(), 
        agent: false
    };

    console.log('Connecting to:', domain);
    xml_http_request(http_request_options, function(err, sess_create_response) {
		if (err) {
			console.error('Error in request:', sess_create.toString());
			return;
		}

		sid = sess_create_response.attrs.sid;

		function send_periodic_request(rid, delay_sec) {
			setInterval(function() {
				var ebody = new ltx.Element('body', {
					rid: rid++, 
					sid: sid
				});

				console.log("[1] Sending request:", ebody.toString());
				http_request_options.body = ebody.toString();
				xml_http_request(http_request_options, function() { });

			}, options.reqdelay * 1000);
		}

		function send_request_on_response(rid) {
			var ebody = new ltx.Element('body', {
				rid: rid++, 
				sid: sid
			});

			console.log("[2] Sending request:", ebody.toString());
			http_request_options.body = ebody.toString();
			xml_http_request(http_request_options, function(err) {
				if (err) {
					console.error('Error in response for request:', ebody.toString());
				}
				else {
					send_request_on_response(rid);
				}
			});
		}

		if (options.reqdelay) {
			send_periodic_request(rid, options.reqdelay);
		}
		else {
			send_request_on_response(rid);
		}
    });
}

function start_test(options) {
    var u = url.parse(options.endpoint);
    //var agent = http.getAgent(u.hostname, u.port);
    // http.globalAgent.maxSockets = options.nconn;

	var i;
    for (i = 0; i < options.nsess; ++i) {
		do_test(options.domain, options.route);
    }
}


function main() {
    var opts = require('tav').set({
		domain: {
			note: 'The XMPP server of \'domain\' shall be connected to'
		}, 
		endpoint: {
			note: 'The BOSH service endpoint (default: http://localhost:5280/http-bind/)', 
			value: 'http://localhost:5280/http-bind/'
		}, 
		route: {
			note: 'The route attribute to use (default: <empty>)', 
			value: ''
		}, 
		nsess: {
			note: 'The number of sessions to open (default: 2000)', 
			value: 2000
		}, 
		nconn: {
			note: 'The number of connections to make (default: 256)', 
			value: 256
		}, 
		reqdelay: {
			note: 'The number of second to delay successive requests on a BOSH session ' + 
				' [0 means send immediately after receiving a response] (default: 30)', 
			value: 30
		}
    });

    options = opts;
    start_test(options);
}


// GO!!
main();

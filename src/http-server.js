// -*-  tab-width:4  -*-

/*
 * Copyright (c) 2011 Dhruv Matani, Anup Kalbalia
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

"use strict";

var dutil       = require('./dutil.js');
var us          = require('underscore');
var helper      = require('./helper.js');
var http        = require('http');
var url         = require('url');
var path        = require('path');
var EventPipe   = require('eventpipe').EventPipe;

var filename    = path.basename(path.normalize(__filename));
var log         = require('./log.js').getLogger(filename);

var BoshRequestParser = require('./bosh-request-parser').BoshRequestParser;

function HTTPServer(port, host, stat_func, system_info_func,
                    bosh_request_handler, http_error_handler,
                    bosh_options) {

    var bosh_request_parser = new BoshRequestParser();
    var req_list1 = [ ], req_list2 = [ ];

    function parse_request(buffers) {
        var valid_request = true;

        // We wrap every request in a <DUMMY> request
        // </DUMMY> tag. This prevents the user from hacking
        // the parser's stream by sending in a request like: <body>
        // <blah/> </body> <body>
        //
        // If the user sent a reuqest like <body> <blah/> <DUMMY> or
        // any such thing, then the parser will be able to detect it.
        var i;
        bosh_request_parser.parse('<DUMMY>');

        for (i = 0; i < buffers.length; i++) {
            // log.trace("Request fragment: %s", buffers[i]);
            valid_request = bosh_request_parser.parse(buffers[i]);
            if (!valid_request) {
                bosh_request_parser.reset();
                return null;
            }
        }
        valid_request = bosh_request_parser.parse('</DUMMY>');

        if (valid_request && bosh_request_parser.parsedBody) {
            if (bosh_request_parser.parsedBody.getChild('body')) {
                var bodyTag = bosh_request_parser.parsedBody.getChild('body');
                bodyTag.parent = null;
                return bodyTag;
            } else {
                // We don't reset the parser if we got a valid
                // bodyTag, but didn't get a <body> child element in
                // the <DUMMY> wrapper tag since the parser state
                // isn't corrupted.
                return null;
            }
        } else {
            // We reset the parser state if we either got a 'false'
            // return from the parse() method or if the bodyTag is
            // absent because the bodyTag could be absent due to an
            // unclosed tag (which might occur due to malicious
            // input). Reseting the parser state clears out the
            // currently being processed stanza.
            bosh_request_parser.reset();
            return null;
        }
    }

    // All request handlers return 'false' on successful handling
    // of the request and 'undefined' if they did NOT handle the
    // request. This is according to the EventPipe listeners API
    // expectation.
    function handle_get_bosh_request(req, res, u) {
        var ppos = u.pathname.search(bosh_options.path);
        if (req.method === 'GET' && ppos !== -1 && u.query.hasOwnProperty('data')) {
            res = new helper.JSONPResponseProxy(req, res);
            res.request_headers = req.headers;

            var body = parse_request([u.query.data]);
            if (body === null) {
                // If we got an invalid JSON, we should respond with
                // valid XML that has an error condition.
                res.end(helper.$terminate({
                    condition: "bad-request",
                    message: "Invalid XML"
                }).toString());
            } else {
                bosh_request_handler(res, body);
            }
            return false;
        }
    }

    function handle_post_bosh_request(req, res, u) {
        var ppos = u.pathname.search(bosh_options.path);
        if (req.method !== 'POST' || ppos === -1) {
            return;
        }

        var req_parts = [ ];
        var req_body_length = 0;
        var req_list_idx = -1;

        var _on_end_callback = us.once(function _unwrapped_on_end_callback(err) {
            if (err) {
                log.warn("%s - destroying connection from '%s'", err, req.socket.remoteAddress);
                req.destroy();
            } else {
                var body = parse_request(req_parts);
                if (body) {
                    log.debug("RECD: %s", dutil.replace_promise(dutil.trim_promise(body), '\n', ' '));
                    res.request_headers = req.headers;
                    bosh_request_handler(res, body);
                }
                else {
                    req_parts.forEach(function (p) {
                        log.warn("XML parsing Error: %s", p);
                    });
                    // Send back valid XML with an appropriate error code.
                    res.end(helper.$terminate({
                        condition: "bad-request",
                        message: "Invalid XML"
                    }).toString());
                }
            }
            req_parts = null;

            // Clear the callback to help free memory.
            if (req_list_idx > -1) {
                if (req_list1[req_list_idx] == _on_end_callback) {
                    req_list1[req_list_idx] = null;
                } else if (req_list2[req_list_idx] == _on_end_callback) {
                    req_list2[req_list_idx] = null;
                }
            }
        });

        // Timeout the request if we don't get an 'end' event within
        // 15 sec of the request being made.
        req_list1.push(_on_end_callback);
        req_list_idx = req_list1.length - 1;

        req.on('data', function (d) {
            req_body_length += d.length;
            if (req_body_length > bosh_options.MAX_DATA_HELD) {
                _on_end_callback(new Error("max_data_held exceeded"));
            }
            else {
                req_parts.push(d);
            }
        })
        .on('end', function () {
            _on_end_callback();
        })
        .on('error', function (ex) {
            log.error("Exception '" + ex.toString() + "' while processing request");
            log.error("Stack Trace: %s\n", ex.stack);
        });
        return false;
    }

    function handle_options(req, res, u) {
        if (req.method === 'OPTIONS') {
            res.writeHead(200, bosh_options.HTTP_OPTIONS_RESPONSE_HEADERS);
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
        var ppos = u.pathname.search(bosh_options.path);
        if (req.method === 'GET' && ppos !== -1 && !u.query.hasOwnProperty('data')) {
            var _headers = { };
            dutil.copy(_headers, bosh_options.HTTP_GET_RESPONSE_HEADERS);
            _headers['Content-Type'] = 'text/html; charset=utf-8';

            res.writeHead(200, _headers);

            var stats = stat_func();
            res.end(stats);
            return false;
        }
    }

    function handle_get_system_info(req, res, u) {
        var ppos = path.dirname(u.pathname).search(bosh_options.path);
        if (ppos == -1) {
            // Try matching both with and without the trailing slash.
            ppos = (path.dirname(u.pathname) + "/").search(bosh_options.path);
        }
        var spos = path.basename(u.pathname).search("sysinfo");

        if (req.method === 'GET' && ppos !== -1 && spos === 0) {
            var _headers = { };
            dutil.copy(_headers, bosh_options.HTTP_GET_RESPONSE_HEADERS);
            _headers['Content-Type'] = 'text/html; charset=utf-8';

            if (bosh_options.SYSTEM_INFO_PASSWORD.length === 0) {
                res.writeHead(403, _headers);

                res.end("No Password set or default password is being used. " +
                        "Please set/change the password in the config file.");
                return false;
            }

            // Check if we got the password back.
            var auth_header = req.headers.authorization;
            if (auth_header) {
                auth_header = auth_header.split(' ')[1];
                var auth_str = new Buffer(auth_header, 'base64').toString();
                var real_auth_str = 'admin:' + bosh_options.SYSTEM_INFO_PASSWORD;
                if (auth_str === real_auth_str) {
                    res.writeHead(200, _headers);
                    var sysinfo = system_info_func();
                    res.end(sysinfo);
                    return false;
                }
            }

            _headers['WWW-Authenticate'] = 
                'Basic realm=System Information. Enter username \'admin\'';
            res.writeHead(401, _headers);
            res.end();
            return false;
        }
    }

    //
    // http://code.google.com/p/node-xmpp-bosh/issues/detail?id=22
    // Supporting cross-domain requests through the addition of flash. This will be necessary
    // if you use the plug strophe.flxhr.js for the library strophe.
    //
    function handle_get_crossdomainXML(req, res, u) {
        if (req.method === 'GET' && req.url === "/crossdomain.xml") {
            res.writeHead(200, bosh_options.HTTP_GET_RESPONSE_HEADERS);
            var crossdomain = '<?xml version="1.0"?>';
            crossdomain += '<!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd">';
            crossdomain += '<cross-domain-policy>';
            crossdomain += '<site-control permitted-cross-domain-policies="all"/>';
            crossdomain += '<allow-access-from domain="*" to-ports="' + port + '" secure="true"/>';
            crossdomain += '<allow-http-request-headers-from domain="*" headers="*" />';
            crossdomain += '</cross-domain-policy>';
            res.end(crossdomain);
            return false;
        }
    }

    function handle_unhandled_request(req, res, u) {
        log.trace("Invalid request, method: %s path: %s", req.method, u.pathname);
        var _headers = { };
        dutil.copy(_headers, bosh_options.HTTP_POST_RESPONSE_HEADERS);
        _headers['Content-Type'] = 'text/plain; charset=utf-8';
        res.writeHead(404, _headers);
        res.end();
        return false;
    }

    function handle_request_timeout() {
        var i;
        for (i = 0; i < req_list2.length; ++i) {
            if (req_list2[i]) {
                req_list2[i](new Error("Timed Out"));
            }
        }
        req_list2 = req_list1;
        req_list1 = [ ];
    }

    var router = new EventPipe();
    router.on('request', handle_post_bosh_request, 1)
        .on('request', handle_get_bosh_request, 2)
        .on('request', handle_options, 3)
        .on('request', handle_get_favicon, 4)
        .on('request', handle_get_system_info, 5)
        .on('request', handle_get_statistics, 6)
        .on('request', handle_get_crossdomainXML, 7)
        .on('request', handle_unhandled_request, 8);

    function http_request_handler(req, res) {
        var u = url.parse(req.url, true);
        log.trace("Processing %s request at location: %s", req.method, u.pathname);
        router.emit('request', req, res, u);
    }

    // Initialize
    var server = http.createServer(http_request_handler);
    server.on('error', http_error_handler);
    server.listen(port, host);

    var req_timeout_interval = setInterval(handle_request_timeout, 15 * 1000);

    this.http_server = server;

    // TODO: Provide a stop() method to stop the server.
}

exports.HTTPServer = HTTPServer;

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

var dutil       = require('./dutil.js');
var us          = require('underscore');
var helper      = require('./helper.js');
var http        = require('http');
var url         = require('url');
var path        = require('path');
var EventPipe   = require('eventpipe').EventPipe;

var filename    = "[" + path.basename(path.normalize(__filename)) + "]";
var log         = require('./log.js').getLogger(filename);

var BoshRequestParser = require('./bosh-request-parser').BoshRequestParser;

function HTTPServer(port, host, stat_func, bosh_request_handler, http_error_handler,
                    bosh_options) {

    var bosh_request_parser = new BoshRequestParser();
    var req_list1 = [ ], req_list2 = [ ];

    function parse_request(buffers) {
        var valid_request = true;
        for (var i = 0, len = buffers.length; i < len; i++) {
            if (!valid_request) return null;
            valid_request = bosh_request_parser.parse(buffers[i]);
        }

        if (valid_request && bosh_request_parser.parsedBody) {
            return bosh_request_parser.parsedBody;
        } else {
            bosh_request_parser = new BoshRequestParser();
        }
    }
    
    // All request handlers return 'false' on successful handling
    // of the request and 'undefined' if they did NOT handle the
    // request. This is according to the EventPipe listeners API
    // expectation.
    function handle_get_bosh_request(req, res, u) {
        var ppos = u.pathname.search(bosh_options.path);
        if (req.method === 'GET' && ppos !== -1 && u.query.hasOwnProperty('data')) {
            if (!bosh_request_parser.parse(u.query.data)) {
                req.destroy();
            } else {
                res = new helper.JSONPResponseProxy(req, res);
                res.request_headers = req.headers;
                bosh_request_handler(res, bosh_request_parser.parsedBody);
            }
            bosh_request_parser.end();
            bosh_request_parser = null;
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

        var _on_end_callback = us.once(function (err) {
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
                    res.end("XML parsing Error");
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
            res.writeHead(200, bosh_options.HTTP_GET_RESPONSE_HEADERS);
            var stats = stat_func();
            res.end(stats);
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
        .on('request', handle_get_statistics, 5)
        .on('request', handle_get_crossdomainXML, 6)
        .on('request', handle_unhandled_request, 7);

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

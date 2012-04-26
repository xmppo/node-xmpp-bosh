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

var http_headers = require('./http-headers.js');
var fs           = require('fs');
var dutil        = require('./dutil.js');
var ejs          = require('ejs');
var url          = require('url');
var http         = require('http');
var response     = require('./response.js');

var path         = require('path');
var filename     = "[" + path.basename(path.normalize(__filename)) + "]";
var log          = require('./log.js').getLogger(filename);

var BoshRequestParser   = require('./bosh-request-parser').BoshRequestParser;
var bosh_request_parser = new BoshRequestParser();

var cross_domain_policy_template = fs.readFileSync(__dirname + "/cross-domain.xml", "utf-8");
var stats_markup_template = fs.readFileSync(__dirname + "/stats.xml", "utf-8");

function RequestHandler(options, bosh_request_handler) {
    var req_list1 = [ ], req_list2 = [ ];
    var cross_domain_policy = ejs.render(cross_domain_policy_template, {
        locals: {
            port: options.port
        }
    });

    function reset_parser() {
        bosh_request_parser = new BoshRequestParser();
    }

    function parse_request(buffers) {
        var i = 0, len = buffers.length; 
        while(i < buffers.length && 
              bosh_request_parser.parse(buffers[i])) 
            i++;
        if (!bosh_request_parser.parsedBody) {
            reset_parser();
        }
        return bosh_request_parser.parsedBody;
    }

    function destroy_bad_request(err, req) {
        log.warn("%s - destroying connection from '%s'", err, req.socket.remoteAddress);
        req.destroy();
    }

    function handle_get_bosh_request(req, res) {
        var data = url.parse(req.url, true).query.data;
        if(!data) {
            destroy_bad_request("no data in GET req", req);
            return;
        }
        var parsedBody = parse_request([data]);
        if (!parsedBody) {
            destroy_bad_request("parse error", req);
        } else {
            res = new response.JSONPProxy(req, res);
            res.request_headers = req.headers;
            bosh_request_handler(res, parsedBody);
        }
    }

    function log_error (ex)  {
        log.error("Exception '" + ex.toString() + "' while processing request");
        log.error("Stack Trace: %s\n", ex.stack);
    }

    function handle_post_bosh_request(req, res) {
        var req_parts = [ ];
        var req_body_length = 0;

        var _parse_and_process_request = function (err) {
            if (err) {
                destroy_bad_request(err, req);
            } else {
                var body = parse_request(req_parts);
                if (body) {
                    log.debug("RECD: %s", body);
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
        };

        // Timeout the request if we don't get an 'end' event within
        // 15 sec of the request being made.
        req_list1.push(req);

        req.once('end', _parse_and_process_request)
            .on('data', function (d) {
                req_parts.push(d);
                req_body_length += d.length;
                if (req_body_length > options.MAX_DATA_HELD) {
                    req.emit('end', new Error("max_data_held exceeded"));
                }
            })
            .on('error', log_error);
    }

    function handle_options(req, res) {
        res.writeHead(200, http_headers.OPTIONS);
        res.end();
    }

    function handle_get_favicon(req, res) {
        res.writeHead(303, {
            'Location': 'http://xmpp.org/favicon.ico'
        });
        res.end();
    }

    function handle_get_statistics(req, res) {
        var stats = ejs.render(stats_markup_template, {
            locals: {
                active_streams : 0,
                total_streams  : 0,
                active_sessions: 0,
                total_sessions : 0,
                uptime: dutil.time_diff(0, process.uptime() * 1000)
            }
        });

        res.writeHead(200, http_headers.GET);
        res.end(stats.toString());
    }

    // http://code.google.com/p/node-xmpp-bosh/issues/detail?id=22
    // Supporting cross-domain requests through the addition of flash.
    // This will be necessary if you use the plug strophe.flxhr.js for
    // the library strophe.
    function handle_get_crossdomainXML(req, res) {
        res.writeHead(200, http_headers.GET);
        res.end(cross_domain_policy);
    }

    function handle_unhandled_request(req, res) {
        log.trace("Invalid request, method: %s path: %s", req.method, req.url);
        res.writeHead(404, http_headers.POST);
        res.end();
    }

    function handle_request_timeout() {
        var i;
        for (i = 0; i < req_list2.length; ++i) {
            req_list2[i].emit("end", new Error("Timed Out"));
        }
        req_list2 = req_list1;
        req_list1 = [ ];
    }
    
    function http_request_handler(req, res) {
        log.trace("Processing %s request at location: %s", req.method, req.url);
        if (req.method === "POST" && req.url.search(options.path) !== -1) {
            handle_post_bosh_request(req, res);
        } else if (req.method === "GET" && req.url.search(options.path) !== -1) {
            handle_get_bosh_request(req, res);
        } else if (req.method === "OPTIONS") {
            handle_options(req, res);
        } else if (req.method === "GET" && req.url === "/favicon.ico") {
            handle_get_favicon(req, res);
        } else if (req.method === "GET" && req.url === "/stats/") {
            handle_get_statistics(req, res);
        } else if (req.method === "GET" && req.url === "/crossdomain.xml") {
            handle_get_crossdomainXML(req, res);
        } else {
            handle_unhandled_request(req, res);
        }
    }


    var request_timout_interval, server = null;
    this.start = function (_server) {
        if (server) return;
        server = _server;
        server.on("request", http_request_handler);
        request_timout_interval = setInterval(handle_request_timeout, 15 * 1000);
    };
    this.stop = function () {
        if (!server) return;
        server.removeListener("request", http_request_handler);
        clearInterval(request_timout_interval);
        server = null;
    };
}

exports.RequestHandler = RequestHandler;

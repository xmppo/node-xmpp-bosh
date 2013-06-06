// -*-  tab-width:4; c-basic-offset:4; indent-tabs-mode:nil  -*-

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

var helper      = require('./helper.js');
var path        = require('path');
var filename    = path.basename(path.normalize(__filename));
var log         = require('./log.js').getLogger(filename);

function BOSH_Options(opts) {
    var _opts = opts;

	log.debug("Node.js version: %s", process.version);

    this.HTTP_GET_RESPONSE_HEADERS = {
        'Content-Type': 'text/html; charset=UTF-8',
        'Cache-Control': 'no-cache, no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, x-requested-with, Set-Cookie',
        'Access-Control-Allow-Methods': 'OPTIONS, GET, POST',
        'Access-Control-Max-Age': '14400'
    };

    this.HTTP_POST_RESPONSE_HEADERS = {
        'Content-Type': 'text/xml; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, x-requested-with, Set-Cookie',
        'Access-Control-Allow-Methods': 'OPTIONS, GET, POST',
        'Access-Control-Max-Age': '14400'
    };

    this.HTTP_OPTIONS_RESPONSE_HEADERS = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, x-requested-with, Set-Cookie',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Max-Age': '14400'
    };

    if (_opts.http_headers) {
        helper.add_to_headers(this.HTTP_GET_RESPONSE_HEADERS, _opts.http_headers);
        helper.add_to_headers(this.HTTP_POST_RESPONSE_HEADERS, _opts.http_headers);
        helper.add_to_headers(this.HTTP_OPTIONS_RESPONSE_HEADERS, _opts.http_headers);
    }

    (function debug_print_HTTP_headers(header_types) {
        header_types.forEach(function(header_type) {
            var hobj = this[header_type];
            Object.keys(hobj).forEach(function(header_key) {
                log.debug("%s::%s => %s", header_type, header_key, hobj[header_key]);
            });
		}.bind(this));
	}.bind(this))(['HTTP_GET_RESPONSE_HEADERS',
		           'HTTP_POST_RESPONSE_HEADERS',
		           'HTTP_OPTIONS_RESPONSE_HEADERS']
                 );

    this.path = _opts.path;

	log.debug("path: %s", this.path);

    // The maximum number of bytes that the BOSH server will
    // "hold" from the client.
    this.MAX_DATA_HELD = _opts.max_data_held || 100000;

    // Don't entertain more than 2 (default) simultaneous connections
    // on any BOSH session.
    this.MAX_BOSH_CONNECTIONS = _opts.max_bosh_connections || 2;

    // The maximum number of packets on either side of the current 'rid'
    // that we are willing to accept.
    this.WINDOW_SIZE = _opts.window_size || 2;

    // How much time (in second) should we hold a response object
    // before sending and empty response on it?
    this.DEFAULT_INACTIVITY = _opts.default_inactivity || 70;

    this.MAX_INACTIVITY = _opts.max_inactivity || 160;

    this.HTTP_SOCKET_KEEPALIVE = _opts.http_socket_keepalive || 60;

    this.MAX_STREAMS_PER_SESSION = _opts.max_streams_per_session || 8;

    this.PIDGIN_COMPATIBLE = _opts.pidgin_compatible || false;

    this.SYSTEM_INFO_PASSWORD = _opts.system_info_password || '';

    log.debug("MAX_DATA_HELD: %s",           this.MAX_DATA_HELD);
    log.debug("MAX_BOSH_CONNECTIONS: %s",    this.MAX_BOSH_CONNECTIONS);
    log.debug("WINDOW_SIZE: %s",             this.WINDOW_SIZE);
    log.debug("DEFAULT_INACTIVITY: %s",      this.DEFAULT_INACTIVITY);
    log.debug("MAX_INACTIVITY: %s",          this.MAX_INACTIVITY);
    log.debug("HTTP_SOCKET_KEEPALIVE: %s",   this.HTTP_SOCKET_KEEPALIVE);
    log.debug("MAX_STREAMS_PER_SESSION: %s", this.MAX_STREAMS_PER_SESSION);
    log.debug("PIDGIN_COMPATIBLE: %s",       this.PIDGIN_COMPATIBLE);
    log.debug("SYSTEM_INFO_PASSWORD: %s",    (this.SYSTEM_INFO_PASSWORD ? "[SET]" : "[NOT SET]"));
}

exports.BOSH_Options = BOSH_Options;

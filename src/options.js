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

var _ = require('underscore');

var config = {
    HTTP_GET_RESPONSE_HEADERS: {
        'Content-Type': 'application/xhtml+xml; charset=UTF-8',
        'Cache-Control': 'no-cache, no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, x-requested-with, Set-Cookie',
        'Access-Control-Allow-Methods': 'OPTIONS, GET, POST',
        'Access-Control-Max-Age': '14400'
    }

    , HTTP_POST_RESPONSE_HEADERS: {
        'Content-Type': 'text/xml; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, x-requested-with, Set-Cookie',
        'Access-Control-Allow-Methods': 'OPTIONS, GET, POST',
        'Access-Control-Max-Age': '14400'
    }

    , HTTP_OPTIONS_RESPONSE_HEADERS: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, x-requested-with, Set-Cookie',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Max-Age': '14400'
    }

    , path: /^\/http-bind(\/+)?$/
    , port: 5280
	, logging: "INFO"

    // The maximum number of bytes that the BOSH server will
    // "hold" from the client.
    , MAX_DATA_HELD: 100000

    // Don't entertain more than 2 (default) simultaneous connections
    // on any BOSH session.
    , MAX_BOSH_CONNECTIONS: 2

    // The maximum number of packets on either side of the current 'rid'
    // that we are willing to accept.
    , WINDOW_SIZE: 2

    // How much time (in second) should we hold a response object
    // before sending and empty response on it?
    , DEFAULT_INACTIVITY: 70

    , MAX_INACTIVITY: 160

	// The value (in second) of keepalive to set on the HTTP response 
	// socket
    , HTTP_SOCKET_KEEPALIVE: 60

	// The maximum number of active streams allowed per BOSH session
    , MAX_STREAMS_PER_SESSION: 8

    // Set to 'true' if you want:
    // 
    // 1. The session creation response to contain the <stream:features/> tag.
    // 2. NO multiple streams support (only supports a single stream
    // per session in this mode).
    // 
    // Useful to work around a pidgin (libpurple) bug.
    // 
    , PIDGIN_COMPATIBLE: false
};

exports.get_config = function (user_config) {
    // TODO: Handle HTTP headers.
    config = _.defaults(user_config, config);
    return config;
};

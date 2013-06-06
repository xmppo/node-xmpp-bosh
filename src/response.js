// -*-  tab-width:4; c-basic-offset: 4; indent-tabs-mode: nil  -*-

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

"use strict";

var us          = require('underscore');
var dutil       = require('./dutil.js');
var helper      = require('./helper.js');
var NULL_FUNC   = dutil.NULL_FUNC;
var path        = require('path');

var filename    = path.basename(path.normalize(__filename));
var log         = require('./log.js').getLogger(filename);

function Response(res, request_id, sid, options) {
    if (!sid) {
        log.warn("No SID passed while creating a Response object");
    }
    if (!res) {
        log.warn("No res structure passed while creating a Response object");
    }

    this.rid        = request_id;
    this._sid       = sid;
	this._res		= res;
	this._options   = options;
}

Response.prototype = {

    set_timeout: function (func, wait) {
		this.timeout = setTimeout(func, wait);
	},

    clear_timeout: function () {
        if (this.timeout) {
		    clearTimeout(this.timeout);
            delete this.timeout;
        }
	},

    set_error_handler: function (error_func) {
		this._res.on('error', error_func);
    },

	// Sends a stream termination response on an HTTP response (res) object.
	// This method is generally used to terminate rogue connections.
	send_termination_stanza: function (attrs) {
		attrs = attrs || { };
		// why this set to true??
		this.send_response(helper.$terminate(attrs).toString(), true);
	},

	// Allow Cross-Domain access
	// https://developer.mozilla.org/En/HTTP_access_control
	send_response: function (msg, do_not_attach_error_handler) {
		// To prevent an unhandled exception later
		if (!do_not_attach_error_handler) {
            this.set_error_handler(NULL_FUNC);
        }
        // According to the spec. we need to send a Content-Length header
        this._res.setHeader("Content-Length", Buffer.byteLength(msg, 'utf8'));
		this._res.writeHead(200, this._options.HTTP_POST_RESPONSE_HEADERS);
		this._res.end(msg);
		log.debug("%s SENT(%s): %s", this._sid, this.rid, dutil.replace_promise(dutil.trim_promise(msg), '\n', ' '));
    },

    // If a client closes a connection and a response to that HTTP request
    // has not yet been sent, then the 'error' event is NOT raised by node.js.
    // Hence, we need not attach an 'error' event handler yet.

    // res.socket could be undefined if this request's socket is still in the 
    // process of sending the previous request's response. Either ways, we 
    // can be sure that setTimeout and setKeepAlive have already been called 
    // on this socket.
    set_socket_options: function (wait) {
        if (this._res.socket) {
            // Increasing the timeout of the underlying socket to allow 
            // wait > 120 sec
            this._res.socket.setTimeout(wait * 1000 + 10);
            this._res.socket.setKeepAlive(true, this._options.HTTP_SOCKET_KEEPALIVE);
        }
    }
};

exports.Response = Response;
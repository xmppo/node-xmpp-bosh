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

var EventPipe   = require('eventpipe').EventPipe;
var util        = require('util');
var dutil       = require('./dutil.js');
var us          = require('underscore');
var path        = require('path');

var filename    = path.basename(path.normalize(__filename));
var log         = require('./log.js').getLogger(filename);

function BoshEventPipe(http_server) {
    this.server = http_server;
}

util.inherits(BoshEventPipe, EventPipe);

dutil.copy(BoshEventPipe.prototype, {
	stop: function () {
		return this.server.close();
	},

	set_session_data: function (session_store) {
		this.sid_state = session_store.get_sessions_obj();
	},

	set_stream_data: function (stream_store) {
		this.sn_state = stream_store.get_streams_obj();
		this.stat_stream_add = us.bind(stream_store.stat_stream_add, stream_store);
		this.stat_stream_terminate = us.bind(stream_store.stat_stream_terminate, stream_store);
	}
});

exports.BoshEventPipe = BoshEventPipe;

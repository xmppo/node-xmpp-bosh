// -*-	tab-width:4  -*-

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

var dutil	    = require('./dutil.js');
var uuid	    = require('node-uuid');
var helper	    = require('./helper.js');
var us		    = require('underscore');
var responsejs	= require('./response.js');
var $terminate	= helper.$terminate;
var $body	    = helper.$body;

function Stream(session, node, options, bep, call_on_terminate) {
    this._on_terminate	= call_on_terminate;
    this._options	    = options;
    this._bep	        = bep;
    this.name	        = uuid();
    this.terminated     = false;
    this.to		        = node.attrs.to;
    this.session	    = session;
    // extra attrs sent to the xmpp server
    // during stream opening stanza
    this.attrs          = { };
    // Routes are specific to a stream, and not a session
    if (node.attrs.route) {
        this.route = helper.route_parse(node.attrs.route);
    }
    if (node.attrs.from) {
        this.from = node.attrs.from;
    }

    this.__defineGetter__("state", function () { //For backward API compatibility.
        return this.session;
    });

}

Stream.prototype = {

    terminate: function (condition) {
        this.session.delete_stream(this);
        this._on_terminate(this, condition);
    },

    // Terminates an open stream.
    // condition: (optional) A string which specifies the condition to
    //     send to the client as to why the stream was closed.
    send_stream_terminate_response: function (condition) {
        var session = this.session;
        var attrs = {
            stream: this.name
        };
        if (condition) {
            // Set the condition so that listeners may be able to
            // determine why this stream was terminated
            this._condition = condition;
            attrs.condition  = condition;
        }

        attrs.type = 'terminate';
        session.enqueue_bosh_response(attrs, this);

        // Mark the stream as terminated AFTER the terminate response has been queued.
        this.terminated = true;
    },

    handle_restart: function (node) {
        if (node.attrs.stream_attrs) {
            this.attrs = dutil.json_parse(node.attrs.stream_attrs, { });
        }
        this._bep.emit('stream-restart', this);
    },

    send_stream_add_response: function () {
        var session = this.session;
        var attrs = {
            stream:     this.name,
            from:	    this.to
        };

        if (this.from) {
            // This is *probably* the JID of the user. Send it back as 'to'.
            // This isn't mentioned in the spec.
            attrs.to = this.from;
        }

        session.enqueue_bosh_response(attrs, this);
    }
};

function StreamStore(bosh_options, bep) {

    this._bosh_options = bosh_options;
    this._bep = bep;

	// This stream object is passed to xmpp-proxy.js to connect
	// to the remote xmpp server. We assume in xmpp-proxy.js that
	// the stream object will contain an attribute name, which is
	// an identifier for the object, and an attribute session which
	// is the session object.

    // This encapsulates the state for the client (xmpp) stream
    //
    // The same but by stream name.
    // Format: {
    //   stream_name: {
    //     name: "Stream Name",
    //     to: "domain.tld",
    //     terminated: true/false,
    //     state: The sid_state object (as above)
    //     from (optional): The JID of the user for this stream
    //     route (optional): The endpoint of the server to connect to (xmpp:domain:port)
    //   }
    // }
    //
    this._sn_state = {
    };

    this._sn_info = {
        length	: 0,	// Stores the number of active streams
        total	: 0	// Stores the total number of streams
    };

    // This keeps in memory the terminate condition for a terminated
    // stream. Both this, and terminated_sessions are used when the
    // connection between nxb and xmpp server breaks and all the
    // session related info is wiped out. We preserve the condition in
    // this case to let the client know why its connection broke.
    this._terminated_streams = {
    };
}

StreamStore.prototype = {

    get_active_no: function () {
        return this._sn_info.length;
    },

    get_total_no: function () {
        return this._sn_info.total;
    },

    //Fetches a BOSH stream object given a BOSH stanza (<body> tag)
    //A node may not contain a stream name if it is the only stream in the session
    get_stream: function (node) {
        var sname = helper.get_stream_name(node);
        var stream = sname ? this._sn_state[sname] : null;
        return stream;
    },

    get_streams_obj: function () {
        return this._sn_state;
    },

    // These functions don't communicate with either the Client
    // or the Connector. That is someone else's job. They just
    // update internal state for the operations being performed.
    add_stream: function (session, node) {
        var on_stream_terminated_handler = function(stream, condition) {
            /* Function to call when stream is terminated */
            helper.save_terminate_condition_for_wait_time(this._terminated_streams,
                                                          stream.name, condition, 
                                                          stream.session.wait);
            delete this._sn_state[stream.name];

            this.stat_stream_terminate();
        }.bind(this);

        var stream = new Stream(session, node, this._bosh_options, this._bep, on_stream_terminated_handler);

        session.add_stream(stream);
        this._sn_state[stream.name] = stream;
        this.stat_stream_add();
        // Don't yet respond to the client. Wait for the 'stream-added' event
        // from the Connector.
        this._bep.emit('stream-add', stream);
        return stream;
    },

    send_invalid_stream_terminate_response: function (ro, sname) {
        var terminate_condition;
        if (this._terminated_streams[sname]) {
            terminate_condition = this._terminated_streams[sname].condition;
        }
        var attrs = {
            condition: terminate_condition || 'item-not-found',
            message: terminate_condition ? '' : 'Invalid stream name',
            stream: sname
        };
        ro.send_termination_stanza(attrs);
    },

    stat_stream_add: function () {
        ++this._sn_info.length;
        ++this._sn_info.total;
    },

    stat_stream_terminate: function () {
        --this._sn_info.length;
    }
};

exports.StreamStore = StreamStore;

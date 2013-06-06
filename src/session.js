// -*-  tab-width:4; c-basic-offset: 4; indent-tabs-mode: nil  -*-

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

var uuid        = require('node-uuid');
var us          = require('underscore');
var dutil       = require('./dutil.js');
var helper      = require('./helper.js');
var responsejs  = require('./response.js');
var assert      = require('assert').ok;
var path        = require('path');

var filename    = path.basename(path.normalize(__filename));
var log         = require('./log.js').getLogger(filename);

var toNumber = us.toNumber;
var sprintf = dutil.sprintf;
var sprintfd = dutil.sprintfd;
var $terminate = helper.$terminate;
var $body = helper.$body;

var BOSH_XMLNS = 'http://jabber.org/protocol/httpbind'; //TODO: might not be required


// This encapsulates the state for the BOSH session
//

// Note: xmpp-proxy.js relies on the session object
// to have a sid attribute and the stream object to
// contain a name attribute. This is done to improve
// readability of the logs, even though it introduces
// coupling. We may choose to get rid of it later.
// Deviation from this behaviour for now might lead to
// a crash or unreadable logs.

// Format: {
//   sid: {
//     sid:
//     rid:
//     wait:
//     hold:
//     res: [ An array of response objects (format is show below) ]
//     pending: [ An array of pending responses to send to the client ]
//     has_next_tick: true if a nextTick handler for this session has
//       been registered, false otherwise
//     ... and other jazz ...
//   }
// }
//
// Format of a single response object:
//
// {
//   res: HTTP response object (obtained from node.js)
//   timeout: A timeout, after which an empty <body> packet will be
//            sent on this response object
//   rid: The 'rid' of the request to which this response object is
//        associated
// }

function Session(node, options, bep, call_on_terminate) {
    this._on_terminate = call_on_terminate;
    this._options = options;
    this._bep = bep;

    this.sid = uuid();
    this.rid = Math.floor(toNumber(node.attrs.rid));
    this.wait = Math.floor(toNumber(node.attrs.wait));
    this.hold = Math.floor(toNumber(node.attrs.hold));
    // The 'inactivity' attribute is an extension
    this.inactivity = Math.floor(toNumber(node.attrs.inactivity ||
        options.DEFAULT_INACTIVITY));
    this.content = "text/xml; charset=utf-8";

    if (this.hold <= 0) {
        this.hold = 1;
    } // Sanitize hold

    if (node.attrs.content) { // If the client included a content attribute, we mimic it.
        this.content = node.attrs.content;
    }

    if (node.attrs.ack) { // If the client included an ack attribute, we support ACKs.
        this.ack = 1;
    }

    if (node.attrs.route) {
        this.route = node.attrs.route;
    }

    // The 'ua' (user-agent) attribute is an extension. This may
    // (optionally) be set by the client.
    if (node.attrs.ua) {
        this.ua = node.attrs.ua;
    }

    this.hold = this.hold > options.MAX_BOSH_CONNECTIONS ? options.MAX_BOSH_CONNECTIONS : this.hold;

    this.res = [ ]; // res needs is sorted in 'rid' order.

    // Contains objects of the form:
    // { "stream-name": [ stanzas ] }
    this.pending_stanzas = { };

    // Contains objects of the form:
    // { "stream-name": [ body element attrs obj] }
    this.pending_bosh_responses = { };

    // Once the response is stitched 
    this.pending_stitched_responses = [ ];

    // index of the next stream to responsd to
    this.next_stream = 0;

    // This is an array of Stream() objects. It holds all the streams
    // that belong to this session.
    this.streams = [ ];

    // A set of responses that have been sent by the BOSH server, but
    // not yet ACKed by the client.
    // Format: { rid: 
    //   {  response: [Response Object with <body> wrapper],
    //      ts: new Date()
    //   } 
    // }
    //
    // Invariant: if unacked_responses[k] is truthy, then 
    // unacked_responses[k], unacked_responses[k+1], ..., 
    // unacked_responses[max_rid_sent] MUST also be truthy.
    // 
    this.unacked_responses = { };

    // A set of queued requests that will become complete when "holes"
    // in the request queue are filled in by packets with the right
    // 'rids'
    this.queued_requests = { };

    // The maxiimum value of the 'rid' (request ID) that has been sent
    // by the BOSH server to the client. i.e. The highest request ID
    // responded to by us. We initialize it to a previous "ghost"
    // request that we supposedly responded to.
    this.max_rid_sent = this.rid - 1;

    if (this.inactivity) {
        // We squeeze options.inactivity between the min and max allowable values
        this.inactivity = [ Math.floor(toNumber(this.inactivity)),
                            options.MAX_INACTIVITY,
                            options.DEFAULT_INACTIVITY].sort(dutil.num_cmp)[1];
    } else {
        this.inactivity = options.DEFAULT_INACTIVITY;
    }

    if (this.wait <= 0 || this.wait > this.inactivity) {
        this.wait = Math.floor(this.inactivity * 0.8);
    }

    // The number of responses to cache so that re-requests for these
    // RIDs can be safely satisfied.
    this.window = options.WINDOW_SIZE;

    this.ver = node.attrs.ver || '1.6';

    // There is just 1 inactivity timeout for the whole BOSH session
    // (as opposed to for each response as it was earlier)
    this.timeout = null;

    // This BOSH session have a pending nextTick() handler?
    this.has_next_tick = false;

    // Is this the first response? Helpful only if
    // options.pidgin_compatible is true.
    this.first_response = true;

    this.__defineGetter__("no_of_streams", function () {
        return this.streams.length;
    });

}

Session.prototype = {

    add_stream: function (stream) {
        this.streams.push(stream);
        this.pending_bosh_responses[stream.name] = [ ];
        this.pending_stanzas[stream.name] = [ ];
    },

    delete_stream: function (stream) {
        if (this.pending_stanzas[stream.name]) {
            delete this.pending_stanzas[stream.name];
            delete this.pending_bosh_responses[stream.name];
        }

        var pos = this.streams.indexOf(stream);
        if (pos !== -1) {
            if (pos < this.next_stream) {
                --this.next_stream;
            }
            this.streams.splice(pos, 1);
        }

        // Null out all the requests for the deleted stream.
        us(this.queued_requests).each(function stream_request_deleter(queued_request, rid) {
            if (queued_request.stream === stream) {
                log.trace("%s %s Will not process request rid: %s", this.sid, stream.name, rid);
                this.queued_requests[rid].node = $body();
                this.queued_requests[rid].stream = null;
            }
        }, this);
    },

    get_only_stream: function () {
        if (this.streams.length === 1) {
            // Let's pretend that the stream name came along
            // with this request. This is mentioned in the XEP.
            return this.streams[0];
        } else {
            return null;
        }
    },

    // is_valid_packet() handles the rid range checking
    // Check the validity of the packet 'node' wrt the
    // state of this BOSH session 'state'. This mainly checks
    // the 'sid' and 'rid' attributes.
    // Also limit the number of attributes in the <body> tag to 20
    is_valid_packet: function (node) {
        log.trace("%s is_valid_packet - node.attrs.rid: %s, state.rid: %s", this.sid, node.attrs.rid, this.rid);

        // Allow variance of "window" rids on either side. This is in violation
        // of the XEP though.
        return node.attrs.sid && node.attrs.rid &&
            node.attrs.rid > this.rid - this.window - 1 &&
            node.attrs.rid < this.rid + this.window + 1 &&
            Object.keys(node.attrs).length < 21;
    },

    //
    //  _process_one_request accepts a request, "node", the response object, "res", associated with that request,
    // and the stream_store which holds all the streams for the bosh server.
    // It processes the request node. uses the stream_store for adding stream to it in case of stream add.
    //
    _process_one_request: function (node, stream, stream_store) {
        var stream_log_name = (stream && stream.name) || "No/All Stream";
        log.trace("%s %s _process_one_request - session.rid: %s, valid_stream: %s", this.sid, stream_log_name, this.rid, !!stream);
        var nodes = node.children;
        // Check if this is a stream restart packet.
        if (helper.is_stream_restart_packet(node)) {
            log.trace("%s %s Stream Restart", this.sid, stream_log_name);
            // Check if stream is valid
            if (!stream) {
                // Make this a session terminate request.
                node.attrs.type = 'terminate';
                delete node.attrs.stream;
                // Q: What should be the value of nodes?
                //
                // A: nodes may be nulled out (or emptied) since this
                // is an invalid BOSH packet. Dunno if we can trust
                // the XML (xmpp) data.
            } else {
                stream.handle_restart(node);
            }
            // According to http://xmpp.org/extensions/xep-0206.html
            // the XML nodes in a restart request should be ignored.
            // Hence, we comply.
            nodes = [ ];
        } else if (helper.is_stream_add_request(node, this._options)) {
            // Check if this is a new stream start packet (multiple streams)
            log.trace("%s: Stream Add", this.sid);
            if (this.is_max_streams_violation(node)) {
                log.info("%s %s max stream violation - will terminate", this.sid, stream_log_name);
                // Make this a session terminate request.
                node.attrs.type = 'terminate';
                node.attrs.condition = 'policy-violation';
                delete node.attrs.stream;
            } else {
                stream = stream_store.add_stream(this, node);
            }
        }

        // Check for stream terminate
        if (helper.is_stream_terminate_request(node)) {
            log.debug("%s Stream Terminate Request", this.sid);
            // We may be required to terminate one stream, or all
            // the open streams on this BOSH session.
            this.handle_client_stream_terminate_request(stream, nodes,
                node.attrs.condition);
            // Once a stream is terminated, there is no point sending
            // nodes. Which is why we did the needful before sending
            // the terminate event.
            nodes = [ ];
        }

        //
        // In any case, we should process the XML nodes.
        //
        if (nodes.length > 0) {
            this.emit_nodes_event(nodes, stream);
        }

        this.send_pending_responses();
    },

    //
    // process_requests processes the requests in the increasing order of their RID's by calling
    // _process_one_request for each request. Returns as soon as it finds an request out of order or when it
    // exhausts the queued requests.
    //
    process_requests: function (stream_store) {
        log.trace("%s process_requests - session.rid: %s", this.sid, this.rid);
        // Process all queued requests
        var _queued_request_keys = Object.keys(this.queued_requests).map(toNumber);
        _queued_request_keys.sort(dutil.num_cmp);

        var node;
        var stream;
        var i;
        var rid;

        for (i = 0; i < _queued_request_keys.length; i++) {
            rid = _queued_request_keys[i];
            if (rid === this.rid + 1) {
                // This is the next logical packet to be processed.
                node = this.queued_requests[rid].node;
                stream = this.queued_requests[rid].stream;
                delete this.queued_requests[rid];
                // Increment the 'rid'
                this.rid += 1;
                log.trace("%s updated session.rid to %s", this.sid, this.rid);
                this._process_one_request(node, stream, stream_store);
            }
        }
    },

    //
    // add_request_for_processing accepts a request (node), the response object associated with that request (res)
    // and the steam_store for calling stream functions.
    // It adds the node to the queue for processing. Also determines which stream this request may belong to, and
    // adds this stream to the request queue so that this can be used while processing the node. - Avoided multiple
    // stream mixing bug. http://code.google.com/p/node-xmpp-bosh/issues/detail?id=25
    // It also adds the response object to the list of held http connections before calling the process_requests
    // method.
    //
    // The return value of false indicates that the request could not be processed and hence any further processing
    // of this request may be stopped.
    // A return value of true only indicates that the request has been added for
    // processing.
    //
    add_request_for_processing: function (node, res, stream_store) {
        log.trace("%s add_request_for_processing - session.rid: %s", this.sid, this.rid);
        this.queued_requests[node.attrs.rid] = {node: node, stream: null};

        var stream;
        var should_process = true;
        // We handle this condition right at the end so that RID updates
        // can be processed correctly. If only the stream name is invalid,
        // we treat this packet as a valid packet (only as far as updates
        // to 'rid' are concerned)

        // this.enqueue_report_if_reqd(node);
        this.handle_acks(node);

        var is_broken = this.handle_broken_connections(node, res);

        if (!is_broken) {
            var stream_name = helper.get_stream_name(node);
            if (stream_name) {
                // The stream name is included in the BOSH request.
                stream = stream_store.get_stream(node);
                if (!stream) {
                    // If the stream name is present, but the stream is not valid, we
                    // blow up.
                    // FIXME: Subtle bug alert: We have implicitly ACKed all
                    // 'rids' till now since we didn't send an 'ack'
                    this.queued_requests[node.attrs.rid].node = $body();
                    var ro = new responsejs.Response(res, node.attrs.rid, this.sid, this._options);
                    stream_store.send_invalid_stream_terminate_response(ro, stream_name);
                    return true;
                }
            }

            // Are we the only stream for this BOSH session?
            if (!stream) { //TODO: verify
                stream = this.get_only_stream();
            }
            // Add to held response objects for this BOSH session
            this.add_held_http_connection(node.attrs.rid, res);

            // Process pending (queued) responses (if any)
            // this.send_pending_responses();
        } else {
            log.info("%s broken-request - no-need-to-process - session.rid: %s", this.sid, this.rid);
            should_process = false;
        }
        if (this.queued_requests.hasOwnProperty(node.attrs.rid)) {
            // This check is required because handle_acks()
            // deletes request for broken connections.
            this.queued_requests[node.attrs.rid].stream = stream;
        }
        return should_process;
    },

    // Adds the response object 'res' to the list of held response
    // objects for this BOSH session. Also sets the associated 'rid' of
    // the response object 'res' to 'rid'
    add_held_http_connection: function (rid, res) {
        var ro = new responsejs.Response(res, rid, this.sid, this._options);

        // Return an empty body if something has already been sent on
        // a request with greater rid.
        if (rid < this.max_rid_sent) {
            // Always use _send_no_requeue() since it correctly
            // manipulates internal state.
            var attrs = {
                message: "rid: " + String(rid) + " is < greatest rid sent (" +
                    String(this.max_rid_sent) + ")",
                condition: 'item-not-found'
            };
            this._send_no_requeue(ro, helper.$body(attrs));
            return;
        }

        // If a client makes more connections than allowed, trim them.
        // http://xmpp.org/extensions/xep-0124.html#overactive
        //
        // This is currently not being enforced. See comment #001
        //
        // However, if the client specifies a 'hold' value greater than
        // 'MAX_BOSH_CONNECTIONS', then the session will be terminated
        // because of the rule below.
        if (this.res.length > this._options.MAX_BOSH_CONNECTIONS) {
            // Just send the termination message and destroy the socket.
            log.info("%s will terminate due to MAX_BOSH_CONNECTIONS exceeded", this.sid);
            var condition = 'policy-violation';
            this.send_terminate_response(ro, condition);

            this.streams.forEach(function stream_terminator(stream) {
                stream.terminate(condition);
            });

            this.terminate(condition);
            return;
        }

        ro.set_socket_options(this.wait);
        ro.set_timeout(function _on_request_timeout_callback() {
            var pos = this.res.indexOf(ro);
            if (pos === -1) {
                return;
            }
            // Remove ourself from list of held connections.
            this.res.splice(pos, 1);
            // Send back an empty body element.
            // We don't add this to unacked_responses since it's wasteful. NO
            // WE ACTUALLY DO add it to unacked_responses
            var attrs = {
                message: 'Timed out'
            };
            // The invariant here is is that
            // add_held_http_connection() shall be called *before*
            // this.first_response is set to false for
            // PIDGIN_COMPATIBLE mode. Only then can we rely on it
            // being 'true' when we come here for the first time.
            if (this._options.PIDGIN_COMPATIBLE && this.first_response) {
                attrs.sid = this.sid;
            }
            this._send_no_requeue(ro, $body(attrs));
        }.bind(this), this.wait * 1000);

        // Insert into its correct position (in RID order)
        var pos;
        for (pos = 0; pos < this.res.length && this.res[pos].rid < ro.rid; ++pos) { }
        this.res.splice(pos, 0, ro);

        log.trace("%s add_held_http_connection - now holding %s res obj", this.sid, this.res.length);
    },

    // Note: Even if we terminate a non-empty BOSH session, it is
    // OKAY since the 'inactivity' timeout will eventually timeout
    // all open streams (on the XMPP server side)
    terminate: function (condition) {
        if (this.streams.length !== 0) {
            log.warn("%s terminate - Terminating potentially non-empty BOSH session", this.sid);
        }

        // Clear out this.streams to aid GC
        this.streams = [ ];

        // We use get_response_object() since it also calls clearTimeout, etc...
        // for us for free.
        var ro = this.get_response_object();
        var attrs = {
            message: 'Cleanup due to session termination'
        };

        while (ro) {
            this._send_no_requeue(ro, helper.$body(attrs));
            ro = this.get_response_object();
        }

        assert(this.res.length === 0);

        // Unset the inactivity timeout
        this._unset_inactivity_timeout();

        this._on_terminate(this, condition);
    },

    // Disables the BOSH session inactivity timeout
    _unset_inactivity_timeout: function () {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
    },

    // Resets the BOSH session inactivity timeout
    reset_inactivity_timeout: function () {
        if (this.timeout) {
            clearTimeout(this.timeout);
        }

        log.trace("%s reset_inactivity_timeout - %s sec", this.sid, this.inactivity + 10);

        var self = this;
        this.timeout = setTimeout(function _on_session_inactivity_timeout_callback() {
            log.info("%s Terminating Session due to inactivity", self.sid);
            // Raise a no-client event on pending, unstitched as well as unacked 
            // responses.
            var _p = us.pluck(self.pending_stitched_responses, 'response');

            var _uar = Object.keys(self.unacked_responses).map(toNumber)
                .map(function (rid) {
                    return self.unacked_responses[rid].response;
                });

            var _usr = [ ];
            self.streams.forEach(function (stream) {
                var _response = self._stitch_response_for_stream(stream.name);
                if (_response) {
                    _usr.push(_response);
                }
            });

            var all = _p.concat(_uar).concat(_usr);
            all.forEach(function (response) {
                self._bep.emit('no-client', response);
            });

            // Pretend as if the client asked to terminate the stream
            self._unset_inactivity_timeout();
            self.handle_client_stream_terminate_request(null, [ ]);
        }, (this.inactivity + 10) * 1000); /* 10 sec grace period */
    },

    // These functions actually send responses to the client

    send_invalid_packet_terminate_response: function (res, node) {
        log.info("%s send_invalid_packet_terminate_response -- will terminate", this.sid);
        var attrs = {
            condition   : 'item-not-found',
            message     : 'Invalid packet'
        };
        if (node.attrs.stream) {
            attrs.stream = node.attrs.stream;
        }
        // Terminate the session (thanks @satyam.s). The XEP mentions this as
        // a MUST, so we humbly comply
        this.handle_client_stream_terminate_request(null, [ ], 'item-not-found');
        var ro = new responsejs.Response(res, null, this.sid, this._options);
        ro.send_termination_stanza(attrs);
    },

    // 
    // This function immediately sends the message to the client (does
    // not queue them up).
    // 
    // ro: The response object to use
    // 
    // condition: (optional) A string which specifies the condition to
    // send to the client as to why the session was closed.
    // 
    send_terminate_response: function (ro, condition) {
        log.debug("%s send_terminate_response - ro: %s, condition: %s", this.sid, !!ro, condition || "no-condition");
        var attrs = { };
        if (condition) {
            attrs.condition = condition;
        }
        var msg = $terminate(attrs);
        this._send_no_requeue(ro, msg);
    },

    send_creation_response: function (stream) {
        // We _must_ get a response object. If we don't, there is something
        // seriously messed up. Log this.
        if (this.res.length === 0) {
            log.warn("%s send_creation_response - No response object to send creation response for stream: %s", this.sid, stream.name);
            return false;
        }

        var attrs = {
            stream              : stream.name, 
            sid                 : this.sid,
            wait                : this.wait,
            ver                 : this.ver, 
            polling             : this.inactivity / 2,
            inactivity          : this.inactivity,
            requests            : this._options.WINDOW_SIZE,
            hold                : this.hold,
            from                : stream.to,
            content             : this.content,
            "xmpp:restartlogic" : "true", 
            "xmlns:xmpp"        : 'urn:xmpp:xbosh',
            // secure:     'false', // TODO
            // 'ack' is set by the client. If the client sets 'ack', then we also
            // do acknowledged request/response. The 'ack' attribute is set
            // by the send_no_requeue function since it is the last one to
            // touch responses before they go out on the wire.
            // Handle window size mismatches
            "window"            : this._options.WINDOW_SIZE
        };

        if (stream.from) {
            // This is *probably* the JID of the user. Send it back as 'to'.
            // This isn't mentioned in the spec.
            attrs.to = stream.from;
        }

        var msg = $body(attrs);
        this.enqueue_bosh_response(attrs, stream);
    },

    // The streams to terminate. We start off by assuming that
    // we have to terminate all streams on this session
    _get_streams_to_terminate: function (stream) {
        var streams = this.streams;
        // If we have a valid stream to terminate, then we reduce
        // our set of streams to terminate to only this one
        if (stream) {
            streams = [ stream ];
        }
        // Streams to terminate
        var stt = streams.filter(us.isTruthy);
        // Streams in error
        var sie = streams.filter(us.isFalsy);
        // From streams, remove all entries that are
        // null or undefined, and log this condition.
        if (sie.length > 0) {
            log.warn("%s get_streams_to_terminate - %s streams in error", this.sid, sie.length);
        }
        return stt;
    },

    // This function handles a stream terminate request from the client.
    // It assumes that the client sent a stream terminate request.
    // i.e. That the request is valid. If we use this to respond to an
    // invalid request, we need to respond to that request separately.
    //
    // 'condition' is an optional parameter. If not specified, no condition
    // (reason) shall be sent in the terminate response
    handle_client_stream_terminate_request: function (stream, nodes, condition) {
        var streams_to_terminate = this._get_streams_to_terminate(stream);
        var will_terminate_all_streams = streams_to_terminate.length ===
            this.streams.length;

        var self = this;
        streams_to_terminate.forEach(function (stream) {
            if (nodes.length > 0) {
                self.emit_nodes_event(nodes, stream);
            }

            // Send stream termination response
            // http://xmpp.org/extensions/xep-0124.html#terminate
            if (!will_terminate_all_streams) {
                stream.send_stream_terminate_response(condition);
            }

            stream.terminate(condition);
            self._bep.emit('stream-terminate', stream);
        });

        // Terminate the session if all streams in this session have
        // been terminated.
        if (this.streams.length === 0) {
            // Send the session termination response to the client.
            // Copy the condition if mentioned.
            this.send_terminate_response(this.get_response_object(), condition);
            // And terminate the rest of the held response objects.
            this.terminate(condition);
        }
    },

    // Fetches a "held" HTTP response object that we can potentially send responses to.
    get_response_object: function () {
        var res = this.res;
        var ro = res.length > 0 ? res.shift() : null;
        if (ro) {
            ro.clear_timeout();
            log.trace("%s get_response_object - return ro with rid: %s", this.sid, ro.rid);
        }

        // Q. Is 'res' ever NOT an object?
        log.trace("%s get_response_object - holding %s ro", this.sid, (res ? res.length : 0));
        return ro;
    },

    _stitch_response_for_stream: function (stream_name) {
        var stitched = this.pending_stanzas[stream_name].length || this.pending_bosh_responses[stream_name].length;

        if (!stitched) {
            return false;
        }

        var attr = {stream: stream_name};

        if (this.pending_bosh_responses[stream_name].length) {
            attr = this.pending_bosh_responses[stream_name].shift();
            attr.stream = stream_name;
        }

        var response = $body(attr);
        
        this.pending_stanzas[stream_name].forEach(function (stanza) {
            response = response.cnode(stanza).tree();
        });
        this.pending_stanzas[stream_name] = [ ];
        return response;
    },
    
    _stitch_new_response: function () {
        var len = this.streams.length;
        this.next_stream = this.next_stream % len;
        log.trace("%s _stitch_new_response - #streams: %s, next_stream: %s", this.sid, len, this.next_stream);
        
        if (!len) {
            return;
        }

        // Processing streams one after another avoids starvation of
        // any one stream.
        var next_stream = this.next_stream;

        do {
            var stream = this.streams[this.next_stream];
            this.next_stream = (this.next_stream + 1) % len;
            
            var response = this._stitch_response_for_stream(stream.name);
            
            if (response) {
                log.trace("%s %s _stitch_response_for_stream - stitched", this.sid, stream.name);
                this.pending_stitched_responses.push({
                    response: response,
                    stream: stream
                });
                break;
            }
        } while (this.next_stream !== next_stream);
    },

    // There is a subtle bug here. If the sending of this response fails
    // then it is appended to the queue of pending responses rather than
    // being added to the right place. This is because we push it again
    // in pending_stitched_responses.
    //
    // We hope for this to not occur too frequently.
    //
    // The right way to do it would be to always stamp the response
    // with the 'rid' when sending and add it to the list of buffered
    // responses. However, in places with a bad network this will
    // degrade the experience for the client. Hence, we stick with
    // the current implementation.
    //
    send_pending_responses: function () {
        log.trace("%s pending.length: %s, Holding %s response objects", 
                  this.sid, this.pending_stitched_responses.length, this.res.length);

        while (true) {
            if (this.res.length === 0) {
                // dont stitch responses as well.
                break;
            }
        
            if (!this.pending_stitched_responses.length) {
                this._stitch_new_response();
            }

            if (this.pending_stitched_responses.length > 0) {
                var ro = this.get_response_object();
                log.trace("%s send_pending_responses - ro: %s, pending_stitched_responses: %s - sending", 
                          this.sid, us.isTruthy(ro), this.pending_stitched_responses.length);

                var _p       = this.pending_stitched_responses.shift();
                var response = _p.response;
                var stream   = _p.stream;

                // We dont do anything on error, we assume that the
                // client will request the missing RID.
                this._send_no_requeue(ro, response);
            } else {
                log.trace("%s send_pending_responses - nothing to send, 0 pending - return", this.sid);
                break;
            }
        }
    },

    // We add this response to the list of pending responses.
    // If and when a new HTTP request on this BOSH session is detected,
    // it will clear the pending response and send the packet
    // (in FIFO order).
    _on_no_client_found: function (response, stream) {
        var _po = {
            response: response,
            stream: stream
        };
        this.pending_stitched_responses.push(_po);
    },

    try_sending: function () {
        if (!this.has_next_tick) {
            process.nextTick(function () {
                this.has_next_tick = false;
                this.send_pending_responses();
            }.bind(this));
            this.has_next_tick = true;
        }
    },


    /* Enqueue a response. Requeue if the sending fails.
     *
     * If you see unordered responses, this bit needs to be fixed
     * to maintain state.pending as a priority queue rather than
     * a simple array.
     *
     * Note: Just adding to the front of the queue will NOT work,
     * so don't even waste your time trying to fix it that way.
     *
     */

    enqueue_bosh_response: function (attrs, stream) {
        log.trace("%s %s", this.sid, stream.name);
        this.pending_bosh_responses[stream.name].push(attrs);

        if (this._options.PIDGIN_COMPATIBLE && this.first_response) {
            this.first_response = false;
        } else {
            this.try_sending();
        }
    },

    enqueue_stanza: function (stanza, stream) {
        log.trace("%s %s", this.sid, stream.name);
        this.pending_stanzas[stream.name].push(stanza);
        this.try_sending();
    },

    // 
    // If the client has enabled ACKs, then acknowledge the highest request
    // that we have received till now -- if it is not the current request.
    // 
    // Returns: The RID that we should ACK or "null", in which case,
    // we implicitly ACK the RID on which we are sending the response.
    // 
    _get_highest_rid_to_ack: function (rid) {
        if (rid !== this.rid) {
            return this.rid;
        }
        return null;
    },

    // Send a response, but do NOT requeue if it fails
    _send_no_requeue: function (ro, msg) {
        log.trace("%s ro: %s", this.sid, !!ro);
        if (us.isFalsy(ro)) {
            return;
        }

        log.trace("%s ro.rid: %s, this.rid: %s", this.sid, ro.rid, this.rid);

        var ack = this._get_highest_rid_to_ack(ro.rid);

        if (this.ack && ack) {
            msg.attrs.ack = ack;
        }

        // Add this sent message to unacked_responses so that
        // unacked_responses is a serial list of unacknowledged
        // responses.
        this.unacked_responses[ro.rid] = {
            response: msg,
            ts: new Date(),
            rid: ro.rid
        };

        this.max_rid_sent = Math.max(this.max_rid_sent, ro.rid);

        var res_str = msg.toString();

        ro.send_response(res_str);
    },

    // Raise the 'nodes' event on 'bep' for every node in 'nodes'.
    // If 'stream' is falsy, then the 'nodes' event is raised on
    // every open stream in the BOSH session (the 'this' object).
    emit_nodes_event: function (nodes, stream) {
        if (!stream) {
            // No stream name specified. This packet needs to be
            // broadcast to all open streams on this BOSH session.
            log.trace("%s emit_nodes_event - emitting %s nodes to all streams", this.sid, nodes.length);
            this.streams.forEach(function (stream) {
                if (stream) {
                    this._bep.emit('nodes', nodes, stream);
                }
            }.bind(this));
        } else {
            log.trace("%s %s emit_nodes_event - emitting %s nodes", this.sid, stream.name, nodes.length);
            this._bep.emit('nodes', nodes, stream);
        }
    },

    // If the client has made more than "hold" connections
    // to us, then we relinquish the rest of the connections
    respond_to_extra_held_response_objects: function () {
        if (this.res.length <= this.hold) {
            return;
        }

        var attrs = {
            message: 'Exceeded ' + String(this.hold) + ' held response objects'
        };
        while (this.res.length > this.hold) {
            log.trace("%s respond_ex_held_ro - res.length: %s, hold: %s", this.sid, this.res.length, this.hold);
            var ro = this.get_response_object();
            this._send_no_requeue(ro, $body(attrs));
        }
    },

    /* Fetches a random stream from the BOSH session. This is used to
     * send a 'stream' object to function that require one even though
     * the particular response may have nothing to do with a stream
     * as such.
     */
    _get_random_stream: function () {
        if (this.streams.length === 0) {
            log.error("%s session has no streams", this.sid);
            return null;
        }
        var stream = this.streams[0];
        return stream;
    },

    /* This function sends 'response' immediately. i.e. It does not
     * queue it up and this response may reach on an RID that is
     * not in sequence.
     */
    _send_immediate: function (res, response_obj) {
        log.trace("%s ro: %s", this.sid, !!response_obj);
        var ro = new responsejs.Response(res, null, this.sid, this._options);
        ro.send_response(response_obj.toString());
    },

    handle_acks: function (node) {
        if (!this.ack) {
            node.attrs.ack = node.attrs.rid - this.window;
        }

        /* Begin ACK handling */
        var _uar_keys = Object.keys(this.unacked_responses).map(toNumber);
        _uar_keys.sort(dutil.num_cmp);

        //We are fairly generous
        if (_uar_keys.length > this._options.WINDOW_SIZE * 4) {
            // The client seems to be buggy. It has not ACKed the last
            // WINDOW_SIZE * 4 requests. We turn off ACKs.
            delete this.ack;
            log.trace("%s handle_acks - disabling ACKs", this.sid);

            // will not emit response-acknowledged for these
            // responses. consider them to be lost.
            while (_uar_keys.length > this.window) {
                var key = _uar_keys.shift();
                delete this.unacked_responses[key];
            }
        }

        if (!node.attrs.ack) {
            // Assume that all requests up to rid-1 have been responded to
            // http://xmpp.org/extensions/xep-0124.html#rids-broken
            node.attrs.ack = node.attrs.rid - 1;
        }

        // If the request from the client includes an ACK, we delete all
        // packets with an 'rid' less than or equal to this value since
        // the client has seen all those packets.
        _uar_keys.forEach(function purge_acknowledged_responses(rid) {
            if (rid <= node.attrs.ack) {
                // Raise the 'response-acknowledged' event.
                log.trace("%s received ack: %s", this.sid, rid);
                this._bep.emit('response-acknowledged',
                               this.unacked_responses[rid], this);
                delete this.unacked_responses[rid];
            }
        }.bind(this));
    },

    // Precondition: This function should be called before handle_acks
    // since handle_acks deletes all unacked_reponses upto node.attrs.ack
    enqueue_report_if_reqd: function (node) {
        // No reports for clients that dont have acks.
        if (!this.ack) {
            return;
        }

        // Client has not acknowledged the receipt of the last message we sent it.
        if (node.attrs.ack < this.max_rid_sent && this.unacked_responses[node.attrs.ack]) {
            var _ts = this.unacked_responses[node.attrs.ack].ts;
            var stream = this._get_random_stream();
            if (!stream) {
                log.error("%s Couldn't get random stream", this.sid);
            } else {
                // We inject a response packet into the pending queue to
                // notify the client that it _may_ have missed something.
                // TODO: we should also have a check which ensures that 
                // time > RTT has passed. 
                log.trace("%s Sending report - max_rid_sent: %s, node.attrs.ack: %s", 
                          this.sid, this.max_rid_sent, node.attrs.ack);
                this.enqueue_bosh_response({
                    report: node.attrs.ack + 1,
                    time: new Date() - _ts,
                }, stream);
            }
        }
    },

    // handle_broken_connections uses the response object "res" to
    // send response to the client in case of abnormal conditions
    // (redundant requests) in which case it returns true or else it
    // returns false -- redundant requests need not be processed again.
    //
    // Precondition: We should call this function BEFORE we update the
    // current session's 'rid'.
    //
    // Postcondition: If we return 'true', then the caller should NOT
    // process this request.
    //
    handle_broken_connections: function (node, res) {
        // Handle the condition of broken connections
        // http://xmpp.org/extensions/xep-0124.html#rids-broken
        //
        // We MUST respond on this same connection - We always have
        // something to respond with for any request with an rid that
        // is less than state.rid + 1
        //
        var _queued_request_keys = Object.keys(this.queued_requests).map(toNumber);
        _queued_request_keys.sort(dutil.num_cmp);
        var is_broken = false;

        var self = this;

        // Q. can we get rid of this forEach and check
        // only for the node.attrs.rid value??
        // 
        // A. No idea - will need to think about it. However, a
        // standard for loop seems more readable here.
        // 
        _queued_request_keys.forEach(function _handle_broken_queued_requests(rid) {
            // There should be exactly 1 'rid' in state.queued_requests
            // that is less than state.rid + 1. -- such requests are
            // immediately returned (processed and deleted by this 
            // function).

            if (rid < self.rid + 1) {
                assert(rid === node.attrs.rid);

                log.trace("%s queued_req::rid: %s, state.rid: %s", self.sid, rid, self.rid);
                delete self.queued_requests[rid];
                is_broken = true;
                if (self.unacked_responses.hasOwnProperty(rid)) {
                    //
                    // Send back the original response on this conection itself
                    //
                    log.trace("%s Resending unacked response: %s", self.sid, rid);
                    self._send_immediate(res, self.unacked_responses[rid].response);
                } else if (rid >= self.rid - self.window - 2) {
                    //
                    // Send back an empty body since it is within the range. We assume
                    // that we didn't send anything on this rid the first time around.
                    //
                    // There is a small issue here. If a client re-sends a request for
                    // an 'rid' that it has already acknowledged, it will get an empty
                    // body the second time around. The client is to be blamed for its
                    // stupidity and not us.
                    //
                    log.trace("%s Sending empty body for rid(out of range): %s", self.sid, rid);
                    self._send_immediate(res, $body());

                } else {
                    //
                    // Terminate this session. We make the rest of the code believe
                    // that the client asked for termination.
                    //
                    // I don't think that control will ever reach here since the
                    // validation for the 'rid' being in a permissible range has
                    // already been made.
                    //
                    // Note: Control DOES reach here. We need to figure out WHY.
                    //
                    log.error("%s Terminating due to out of bound rid: %s, session.rid: %s", self.sid, rid, self.rid);
                    dutil.copy(node.attrs, { //TODO: Might be moved to helper.
                        type: 'terminate',
                        condition: 'item-not-found',
                        xmlns: BOSH_XMLNS
                    });
                    is_broken = false;
                }
            }
        });

        return is_broken;
    },

    is_max_streams_violation: function () {
        return (this.streams.length > this._options.MAX_STREAMS_PER_SESSION);
    }
};


function SessionStore(bosh_options, bep) {

    this._bosh_options = bosh_options;

    this._bep = bep;

    this._sid_state = {
    };

    this._sid_info = {
        length  : 0,     // Stores the number of active sessions
        total   : 0     // Stores the total number of sessions
    };

    // This holds the terminate condition for terminated
    // sessions. Both this, and terminated_streams are used when the
    // connection between nxb and xmpp server breaks and all the
    // session related info is wiped out. We preserve the condition in
    // this case to let the client know why its connection broke.
    this._terminated_sessions = {
    };

}

// Ideally, the session_* functions shouldn't worry about anything except for 
// session state maintenance. They should specifically NOT know about streams.
// There may be some exceptions where the abstractions leak into one another, 
// but they should be the exceptions (and there should be a good reason for 
// such an occurence) and not the rule.
// 
SessionStore.prototype = {

    get_active_no: function () {
        return this._sid_info.length;
    },

    get_total_no: function () {
        return this._sid_info.total;
    },

    //Fetches a BOSH session object given a BOSH stanza (<body> tag)
    get_session: function (node) {
        var sid = node.attrs.sid;
        var session = sid ? this._sid_state[sid] : null;
        return session;
    },

    get_sessions_obj: function () {
        return this._sid_state;
    },

    add_session: function (node, res) {
        var self = this;
        // TODO: Log the number of entries in this._terminated_sessions
        var session = new Session(node, this._bosh_options, this._bep,
            function (session, condition) {
                helper.save_terminate_condition_for_wait_time(self._terminated_sessions,
                    session.sid, condition, session.wait);
                delete self._sid_state[session.sid];
                self.stat_session_terminate();
            });
        session.reset_inactivity_timeout();
        session.add_held_http_connection(node.attrs.rid, res);
        this._sid_state[session.sid] = session;
        this.stat_session_add();
        return session;
    },

    send_invalid_session_terminate_response: function (res, node) {
        log.trace("Sending invalid sid");
        var terminate_condition;
        if (this._terminated_sessions[node.attrs.sid]) {
            terminate_condition = this._terminated_sessions[node.attrs.sid].condition;
        }
        var attrs = {
            condition   : terminate_condition || 'item-not-found',
            message     : terminate_condition ? '' : 'Invalid session ID'
        };
        var ro = new responsejs.Response(res, null, "invalid-sid", this._bosh_options);
        ro.send_termination_stanza(attrs);
    },

    stat_session_add: function () {
        ++this._sid_info.length;
        ++this._sid_info.total;
    },

    stat_session_terminate: function () {
        --this._sid_info.length;
    }

};

exports.SessionStore = SessionStore;

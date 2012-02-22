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
var _           = require('underscore');
var helper      = require('./helper.js');
var EventPipe   = require('eventpipe').EventPipe;
var BOSHServer  = require('./bosh-http-server.js').BOSHServer;

var stream_store   = require('./stream-store.js');
var session_store  = require('./session-store.js');

var toNumber    = _.toNumber;
var sprintf     = dutil.sprintf;
var sprintfd    = dutil.sprintfd;

var path        = require('path');
var filename    = "[" + path.basename(path.normalize(__filename)) + "]";
var log         = require('./log.js').getLogger(filename);

//
// +-------+
// | NOTE: |
// +-------+
//
// Always ensure that you update the definitions of the objects (in the
// comments) as and when you add/remove members from them. Please try to
// keep these object definitions up-to-date since it is the main
// (and only) place of reference for object structure.
//

function process_bosh_request(res, node) {
    if (!node) return;
    var nodes = [ ];

    var session = null;
    var stream = null;

    node = helper.sanitize_request_node(node);

    // Check if this is a session start packet.
    if (helper.is_session_creation_packet(node)) {
        log.trace("Session Creation");
        session = session_store.add_session(node, res);
        stream  = stream_store.add_stream(session, node);

        // Respond to the client.
        session.send_creation_response(stream);
        nodes = node.children;

        // NULL out res so that it is not added again
        res = null;

        //
        // In any case, we should process the XML nodes.
        //
        if (nodes.length > 0) {
            session.emit_nodes_event(nodes, stream);
        }

    } else {
        session = session_store.get_session(node);
        if (!session) { //No (valid) session ID in BOSH request. Not phare enuph.
            log.trace("%s Invalid Session", node.attrs.sid || "No_Session_ID");
            session_store.send_invalid_session_terminate_response(res, node);
            return;
        }
        try {
            // This is enclosed in a try/catch block since invalid requests
            // at this point MAY not have these attributes
            log.trace("%s %s req.rid: %s, session.rid: %s", session.sid, 
                      node.attrs.stream || "NO_Stream", node.attrs.rid, 
                      session.rid);
        } catch (ex) { }

        // Check the validity of the packet and the BOSH session
        if (!session.is_valid_packet(node)) {
            log.trace("%s Invalid Packet", session.sid);
            session.send_invalid_packet_terminate_response(res, node);
            return;
        }

        // Reset the BOSH session timeout
        session.reset_inactivity_timeout();

        if (session.add_request_for_processing(node, res, stream_store)){
            session.process_requests(stream_store);
        } else {
            session.send_pending_responses();
        }
    } // else (not session start)


    // Comment #001
    //
    // Respond to any extra "held" response objects that we actually
    // should not be holding on to (Thanks Stefan)
    //
    // This is in disagreement with the XEP
    // http://xmpp.org/extensions/xep-0124.html#overactive
    // if the client sent an empty <body/> tag and was overactive
    //
    // However, we do it since many flaky clients and network
    // configurations exist in the wild.
    //
    session.respond_to_extra_held_response_objects();
}


// When the Connector is able to add the stream, we too do the same and
// respond to the client accordingly.
function _on_stream_added(stream) {
    log.trace("%s %s stream-added", stream.state.sid, stream.name);
    // Send only if this is the 2nd (or more) stream on this BOSH session.
    // This should work all the time. If anyone finds a case where it will
    // NOT work, please do let me know.
    var session = stream.session;
    if (session.no_of_streams > 1) {
        stream.send_stream_add_response();
    }
}

// When a response is received from the connector, try to send it out to the
// real client if possible.
function _on_repsponse(connector_response, stream) {
    log.trace("%s %s response: %s", stream.state.sid, stream.name, connector_response);
    stream.session.enqueue_stanza(connector_response, stream);
}

// This event is raised when the server terminates the connection.
// The Connector typically raises this even so that we can tell
// the client (user) that such an event has occurred.
function _on_terminate(stream, error) {
    // We send a terminate response to the client.
    var condition = error || '';
    stream.send_stream_terminate_response(condition);
    stream_store.
    stream.terminate(condition);
}

exports.createServer = function () {
    // The BOSH event emitter. People outside will subscribe to
    // events from this guy. We return an instance of BoshEventPipe
    // to the outside world when anyone calls createServer()
    var bosh_server = new BOSHServer();
    var boshEventPipe = new EventPipe();

    boshEventPipe.on('stream-added', _on_stream_added)
        .on('response', _on_repsponse)
        .on('terminate', _on_terminate);
    bosh_server.on("bosh-request", process_bosh_request);
    bosh_server.start();

    return boshEventPipe;
};

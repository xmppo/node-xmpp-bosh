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

var ltx            = require('ltx');
var dutil          = require('./dutil.js');
var us             = require('underscore');
var sess           = require('./session.js');
var strm           = require('./stream.js');
var helper         = require('./helper.js');
var opt            = require('./options.js');
var path           = require('path');
var bee            = require('./bosh-event-emitter.js');
var RequestHandler = require('./http-request-handler.js').RequestHandler;

var filename    = "[" + path.basename(path.normalize(__filename)) + "]";
var log         = require('./log.js').getLogger(filename);

//
// Important links:
//
// List of BOSH errors for the terminate packet
// http://xmpp.org/extensions/xep-0124.html#errorstatus-terminal
//
// XEP-206
// http://xmpp.org/extensions/xep-0206.html
//
// CORS headers
// https://developer.mozilla.org/En/HTTP_access_control
//

//
// options:
//
// * path
// * port
// * host
// * max_data_held
// * max_bosh_connections
// * window_size
// * default_inactivity
// * max_inactivity
// * http_socket_keepalive
// * http_headers
//


exports.createServer = function (options, http_server) {
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

    var session_store;
    var stream_store;
    var bep;
    var bosh_options;

    function process_bosh_request(res, node) {
        // This will eventually contain all the nodes to be processed.
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

            log.trace("%s %s req.rid: %s, session.rid: %s", session.sid, 
                          node.attrs.stream || "NO_Stream", node.attrs.rid, 
                          session.rid);
            
            // are comments like this good?
            // I was also thinking if logging(log statements) can
            // replace comments all together??
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
    function _on_response(stanza, stream) {
        log.trace("%s %s response: %s", stream.state.sid, stream.name, stanza);
        var session = stream.session;

        session.enqueue_stanza(stanza, stream);

        // Send a stream termination tag in the <body> element
        // if the stanza is a <stream:error> stanza.
        // 
        // https://github.com/dhruvbird/node-xmpp-bosh/issues/21
        if (stanza.is('error')) {
            stream.send_stream_terminate_response('remote-stream-error');
        }
    }

    // This event is raised when the server terminates the connection.
    // The Connector typically raises this event so that we can tell
    // the client (user) that such an event has occurred.
    function _on_terminate(stream, error) {
        // We send a terminate response to the client.
        var condition = error || '';
        stream.send_stream_terminate_response(condition);
        stream.terminate(condition);

        var session = stream.session;
        // Should we terminate the BOSH session as well?
        if (session.no_of_streams === 0) {
            session.send_terminate_response(session.get_response_object(),
                                            condition);
            session.terminate(condition);
        }
    }
    
    bosh_options = new opt.BOSH_Options(options);

    var request_handler = new RequestHandler({
        host: options.host,
        port: options.port,
        path: options.path,
        MAX_DATA_HELD: bosh_options.max_data_held || 100000
    }, process_bosh_request);

    // The BOSH event emitter. People outside will subscribe to
    // events from this guy. We return an instance of BoshEventPipe
    // to the outside world when anyone calls createServer()
    bep = new bee.BoshEventPipe();
    bep.on('stream-added', _on_stream_added);
    bep.on('response',     _on_response);
    bep.on('terminate',    _on_terminate);

    session_store = new sess.SessionStore(bosh_options, bep);
    stream_store  = new strm.StreamStore(bosh_options, bep);

    bep.set_session_data(session_store);
    bep.set_stream_data(stream_store);
    
    request_handler.start(http_server);

    return bep;
};

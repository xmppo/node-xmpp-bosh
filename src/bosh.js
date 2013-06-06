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

var ltx         = require('ltx');
var dutil       = require('./dutil.js');
var us          = require('underscore');
var fs          = require('fs');
var os          = require('os');
var sess        = require('./session.js');
var strm        = require('./stream.js');
var helper      = require('./helper.js');
var opt         = require('./options.js');
var path        = require('path');
var bee         = require('./bosh-event-emitter.js');
var http        = require('./http-server.js');
var ejs         = require('ejs');

var toNumber    = us.toNumber;
var sprintf     = dutil.sprintf;
var sprintfd    = dutil.sprintfd;

var filename    = path.basename(path.normalize(__filename));
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


exports.createServer = function (options) {
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

    var started =  new Date(); // When was this server started?
    var session_store;
    var stream_store;
    var bep;
    var bosh_options;
    var server;
    var stats_template = ejs.compile(fs.readFileSync(require.resolve('../templates/stats.html'), 'utf8'));
    var sysinfo_template = ejs.compile(fs.readFileSync(require.resolve('../templates/sysinfo.html'), 'utf8'));
    var pkgJSON = JSON.parse(fs.readFileSync(require.resolve('../package.json')));

    function get_system_info() {
        // Use a pre-compiled ejs template here.
        var opt_keys = us.without(Object.keys(options), 'system_info_password');
        var opts = opt_keys.map(function(opt_key) {
            var v = options[opt_key];
            if (v instanceof RegExp) {
                v = String(v);
            } else {
                v = JSON.stringify(v);
            }
            return {
                key: opt_key,
                value: v
            };
        });
        var content = sysinfo_template({
            hostname:        os.hostname(),
            uptime:          dutil.time_diff(started, new Date()),
            version:         pkgJSON.version,
            active_sessions: session_store.get_active_no(),
            total_sessions:  session_store.get_total_no(),
            active_streams:  stream_store.get_active_no(),
            total_streams:   stream_store.get_total_no(),
            options:         opts
        });
        return content;
    }

    function get_statistics() {
        // Use a pre-compiled ejs template here.
        var content = stats_template({
            hostname:        os.hostname(),
            uptime:          dutil.time_diff(started, new Date()),
            active_sessions: session_store.get_active_no(),
            total_sessions:  session_store.get_total_no(),
            active_streams:  stream_store.get_active_no(),
            total_streams:   stream_store.get_total_no()
        });
        return content;
    }

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


    function http_error_handler(ex) {
        // We enforce similar semantics as the rest of the node.js for the 'error'
        // event and throw an exception if it is unhandled
        if (!bep.emit('error', ex)) {
            throw new Error(
                sprintf('ERROR (%s) on listener at endpoint: http://%s:%s%s',
                        String(ex), options.host, options.port, options.path)
            );
        }
    }

    //Called when the 'end' event for the request is fired by the HTTP request handler
    function bosh_request_handler(res, node) {
        if (!node) {
            res.writeHead(200, bosh_options.HTTP_POST_RESPONSE_HEADERS);
            res.end(helper.$terminate({ condition: 'bad-request' }).toString());
            return;
        }
        log.trace("Processing Request");
        process_bosh_request(res, node);
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
        log.trace("%s %s response: %s", stream.state.sid, stream.name, 
                  dutil.replace_promise(dutil.trim_promise(stanza), '\n', ' '));
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
    server = new http.HTTPServer(options.port, options.host, get_statistics,
                                 get_system_info, bosh_request_handler,
                                 http_error_handler, bosh_options);
    // The BOSH event emitter. People outside will subscribe to
    // events from this guy. We return an instance of BoshEventPipe
    // to the outside world when anyone calls createServer()
    bep = new bee.BoshEventPipe(server.http_server);

    bep.on('stream-added', _on_stream_added);
    bep.on('response',     _on_response);
    bep.on('terminate',    _on_terminate);

    session_store = new sess.SessionStore(bosh_options, bep);
    stream_store  = new strm.StreamStore(bosh_options, bep);

    bep.set_session_data(session_store);
    bep.set_stream_data(stream_store);
    return bep;
};

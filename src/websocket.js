// -*-  tab-width:4  -*-

/*
 * Copyright (c) 2011 Dhruv Matani, Sonny Piers
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

var http   = require('http');
var ltx    = require('ltx');
var util   = require('util');
var uuid   = require('node-uuid');
var dutil  = require('./dutil.js');
var us     = require('underscore');
var assert = require('assert').ok;
var EventPipe = require('eventpipe').EventPipe;

var path        = require('path');
var filename    = path.basename(path.normalize(__filename));
var log         = require('./log.js').getLogger(filename);

var xmlTextDeclRE = /<\?xml [^\?]+\?>/;

var STREAM_UNOPENED = 1;
var STREAM_OPENED   = 2;
var STREAM_CLOSED   = 3;

var XML_STREAM_CLOSE = '</stream:stream>';

//
// Important links:
//
// Draft Websocket protocol specification
// http://tools.ietf.org/html/draft-moffitt-xmpp-over-websocket-00
//
// Strophe.js modified for Websocket support
// https://github.com/superfeedr/strophejs/tree/protocol-ed
//

exports.createServer = function(bosh_server, webSocket) {
    webSocket = webSocket || require('ws');
    
    // State information for XMPP streams
    var sn_state = { };
    
    function WebSocketEventPipe(bosh_server) {
        this.bosh_server = bosh_server;
    }
    
    util.inherits(WebSocketEventPipe, EventPipe);
    
    dutil.copy(WebSocketEventPipe.prototype, {
        stop: function() {
            return websocket_server.close();
        },
        stat_stream_add: function() {
            return this.bosh_server.stat_stream_add();
        },
        stat_stream_terminate: function() {
            return this.bosh_server.stat_stream_terminate();
        }
    });
    
    var wsep = new WebSocketEventPipe(bosh_server);
    
    var websocket_server = new webSocket.Server({
        server:  bosh_server.server,
        // autoAcceptConnections: true,
        // subprotocol: 'xmpp'
    });
    
    wsep.server = websocket_server;
    
    wsep.on('stream-added', function(sstate) {
        var to = sstate.to || '';
        var ss_xml = new ltx.Element('stream:stream', {
            'xmlns': 'jabber:client',
            'xmlns:stream': 'http://etherx.jabber.org/streams',
            'version': '1.0',
            'xml:lang': 'en',
            'from': to
        }).toString();
        if (sstate.has_open_stream_tag) {
            ss_xml = ss_xml.replace('/>', '>');
        }
        log.trace("%s sending data: %s", sstate.name, ss_xml);
        wsep.emit('response', ss_xml, sstate);
    });

    // Special case for WebSockets due to
    // https://github.com/dhruvbird/node-xmpp-bosh/issues/16
    wsep.on('stream-restarted', function(sstate, stanza) {
        var ss_xml = stanza.toString();
        if (sstate.has_open_stream_tag) {
            ss_xml = ss_xml.replace('/>', '>');
        }
        log.trace("%s sending stream:stream tag on stream restart: %s", sstate.name, ss_xml);
        wsep.emit('response', ss_xml, sstate);
    });

    wsep.on('response', function(response, sstate) {
        // Send the data back to the client
        if (!sstate.terminated && sn_state.hasOwnProperty(sstate.name)) {
            try {
                sstate.conn.send(response.toString());
            } catch (e) {
                log.warn(e.stack);
            }
        }
    });

    wsep.on('terminate', function(sstate, had_error) {
        if (!sn_state.hasOwnProperty(sstate.name)) {
            return;
        }
        if (sstate.terminated) {
            log.warn('%s Multiple terminate events received', sstate.name);
            return;
        }
        wsep.emit('response', XML_STREAM_CLOSE, sstate);
        sstate.terminated = true;
    });
    
    websocket_server.on('connection', function(conn) {
        var stream_name = uuid();
        
        // Note: xmpp-proxy.js relies on the session object
        // to have a sid attribute and the stream object to
        // contain a name attribute. This is done to improve
        // readability of the logs, even though it introduces
        // coupling. We may choose to get rid of it later.
        // Deviation from this behaviour for now might lead to
        // a crash or unreadable logs.
        
        var sstate = {
            name: stream_name,
            stream_state: STREAM_UNOPENED,
            conn: conn,
            // Compatibility with xmpp-proxy-connector
            state: {
                sid: "WEBSOCKET"
            },
            session: {
                sid: "WEBSOCKET"
            },
            has_open_stream_tag: false,
            terminated: false,
            last_pong: Date.now(),
            ping_timer_id: setInterval(function () {
                if (Date.now() - sstate.last_pong > 60000) {
                    log.warn("%s no pong - closing stream", stream_name);
                    sstate.terminated = true;
                    // Other end unresponsive: no point in a graceful close
                    conn.terminate();
                    // Prevent any further ping attempts (close event may not be
                    // emitted immediately)
                    clearInterval(sstate.ping_timer_id);
                    sstate.ping_timer_id = null;
                    return;
                }

                try {
                    conn.ping();
                } catch (e) {
                   log.warn(e.stack);
                }
            }, 30000)
        };
        sn_state[stream_name] = sstate;

        conn.on('pong', function() {
            sstate.last_pong = Date.now();
        });

        conn.on('message', function(message) {
            // console.log("message:", message);
            if (typeof message != 'string') {
                log.warn("Only utf-8 supported...");
                return;
            }
            
            // Check if this is a stream open message
            if (message.indexOf('<stream:stream') !== -1) {
                // Yes, it is.

                // Remove the leading <?xml ... ?> declaration if present.
                //
                // See
                // https://github.com/dhruvbird/node-xmpp-bosh/issues/59
                // for more details.
                //
                message = message.replace(xmlTextDeclRE, '');

                // Now, check if it is closed or unclosed
                if (message.indexOf('/>') === -1) {
                    // Unclosed - Close it to continue parsing
                    message += XML_STREAM_CLOSE;
                    sstate.has_open_stream_tag = true;
                }
            } else if (message.indexOf(XML_STREAM_CLOSE) !== -1) {
                // Stream close message from a client must appear in a message
                // by itself - see draft-moffitt-xmpp-over-websocket-02
                if (sstate.stream_state === STREAM_CLOSED) {
                    log.warn('%s Multiple stream close tags received', stream_name);
                    return;
                }
                sstate.stream_state = STREAM_CLOSED;
                if (sstate.terminated) {
                    // We initiated the stream close, so we should close the WS
                    // Note: Always delete before closing
                    delete sn_state[sstate.name];
                    try {
                        sstate.conn.close();
                    } catch (e) {
                        log.warn(e.stack);
                    }
                } else {
                    // Raise the stream-terminate event on wsep
                    wsep.emit('stream-terminate', sstate);
                    wsep.emit('response', XML_STREAM_CLOSE, sstate);
                    sstate.terminated = true;
                }
                return;
            }
            
            // TODO: Maybe use a SAX based parser instead
            message = '<dummy>' + message + '</dummy>';
            
            log.debug("%s - Processing: %s", stream_name, message);
            
            // XML parse the message
            var nodes = dutil.xml_parse(message);
            if (!nodes) {
                log.warn("%s Closing connection due to invalid packet", stream_name);
                sstate.terminated = true;
                sstate.conn.close();
                return;
            }
            
            // console.log("xml nodes:", nodes);
            nodes = nodes.children;
            
            // The stream start node is special since we trigger a
            // stream-add event when we get it.
            var ss_node = nodes.filter(function(node) {
                return typeof node.is === 'function' && node.is('stream');
            });
            
            ss_node = us.first(ss_node);
            
            nodes = nodes.filter(function(node) {
                return typeof node.is === 'function' ? !node.is('stream') : true;
            });
            
            if (ss_node) {
                if (sstate.stream_state === STREAM_UNOPENED) {
                    // Start a new stream
                    wsep.stat_stream_add();
                    sstate.stream_state = STREAM_OPENED;
                    // console.log("stream start attrs:", ss_node.attrs);
                    
                    sstate.to = ss_node.attrs.to;
                    wsep.emit('stream-add', sstate, ss_node.attrs);
                } else if (sstate.stream_state === STREAM_OPENED) {
                    // Restart the current stream
                    wsep.emit('stream-restart', sstate, ss_node.attrs);
                }
            }
            
            // console.log("nodes:", nodes);
            assert(nodes instanceof Array);
            
            // Process the nodes normally.
            wsep.emit('nodes', nodes, sstate);
        });
        
        conn.on('close', function() {
            log.trace("%s Stream close requested", stream_name);
            
            if (sn_state.hasOwnProperty(stream_name)) {
                // Note: Always delete before emitting events
                delete sn_state[stream_name];
                if (sstate.stream_state !== STREAM_CLOSED) {
                    // Bad client: did not close the stream first
                    // Raise the stream-terminate event on wsep
                    wsep.emit('stream-terminate', sstate);
                    sstate.terminated = true;
                }
            }

            // This code is run regardless of which end closed the stream
            if (sstate.ping_timer_id !== null) {
                clearInterval(sstate.ping_timer_id);
                sstate.ping_timer_id = null;
            }
            wsep.stat_stream_terminate();
        });
        
    });
    
    websocket_server.on('disconnect', function(conn) {
    });
    
    function emit_error(ex) {
        // We enforce similar semantics as the rest of the node.js for
        // the 'error' event and throw an exception if it is unhandled
        if (!wsep.emit('error', ex)) {
            throw new Error(ex.toString());
        }
    }
    
    // Handle the 'error' event on the bosh_server and re-emit it.
    // Throw an exception if no one handles the exception we threw
    bosh_server.on('error', emit_error);
    websocket_server.on('error', emit_error);
    
    return wsep;
};

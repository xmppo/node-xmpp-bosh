// -*-  tab-width:4; c-basic-offset:4; indent-tabs-mode:nil  -*-

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

/* The STARTTLS bits are taken from the node-xmpp project on github by astro */

"use strict";

var net    = require('net');
var ltx    = require('ltx');
var events = require("events");
var util   = require('util');
var dutil  = require('./dutil.js');
var us     = require('underscore');
var XmppParser = require('./stream-parser.js').XmppStreamParser;

var path        = require('path');
var filename    = path.basename(path.normalize(__filename));
var log         = require('./log.js').getLogger(filename);

var NS_XMPP_TLS =     'urn:ietf:params:xml:ns:xmpp-tls';
var NS_STREAM =       'http://etherx.jabber.org/streams';
var NS_XMPP_STREAMS = 'urn:ietf:params:xml:ns:xmpp-streams';


function XMPPProxy(xmpp_host, lookup_service, stream_start_attrs, options, void_star) {
    this._xmpp_host      = xmpp_host;

    // This code assumes that void_star will have a
    // name attribute and a session object that has
    // a sid attribute. These are used as identifiers
    // to improve logging. We may choose to get rid of
    // them later. Don't rely on this behaviour.

    this._firewall       = options.firewall;
    this._void_star      = void_star;
    this._lookup_service = lookup_service;
    this._default_stream_attrs = {
        'xmlns:stream': 'http://etherx.jabber.org/streams', 
        xmlns:          'jabber:client',
        to:             this._xmpp_host,
        version:        '1.0'
    };

    this.stream_start_attrs = stream_start_attrs || { };

    this._max_xmpp_stanza_size = options.max_xmpp_stanza_size || 500000;
    this._prev_byte_index = -1;

    // Suppress the <stream:stream> tag (stream-restart event) if it
    // is a response to a STARTTLS request that we (the proxy
    // initiated).
    // 
    // https://github.com/dhruvbird/node-xmpp-bosh/issues/16
    this._suppress_stream_restart_event = false;

    this._no_tls_domains = { };
    var _ntd = options.no_tls_domains || [ ];
    _ntd.forEach(function(domain) {
        this._no_tls_domains[domain] = 1;
    }.bind(this));

    this._is_connected = false;
    this._parser       = new XmppParser();
    this._terminate_on_connect = false;

    return this;
}

util.inherits(XMPPProxy, events.EventEmitter);

exports.Proxy = XMPPProxy;

var ATTACH_SOCKET_HANDLERS = true;
var SKIP_SOCKET_HANDLERS   = false;

dutil.copy(XMPPProxy.prototype, {
    _detach_handlers: function() {
        if (this._lookup_service) {
            this._lookup_service.removeAllListeners('connect');
            this._lookup_service.removeAllListeners('error');
        }
        this._sock.removeAllListeners('data');
        this._sock.removeAllListeners('error');
        this._sock.removeAllListeners('close');
    }, 

    _attach_handlers: function(socket_handlers_fate) {
        // Ideally, 'connect' and 'close' should be once() listeners
        // but having them as on() listeners has helped us catch some
        // nasty bugs, so we let them be.
        if (this._lookup_service) {
            this._lookup_service.on('connect', us.bind(this._on_connect, this));
            this._lookup_service.on('error', us.bind(this._on_lookup_error, this));
        }
        if (socket_handlers_fate == ATTACH_SOCKET_HANDLERS) {
            this._sock.on  ('data',    us.bind(this._on_data, this));
            this._sock.once('close',   us.bind(this._on_close, this));
            this._sock.on  ('error',   dutil.NULL_FUNC);
        }
    }, 

    _attach_handlers_to_parser: function() {
        this._parser.on("stanza", this._on_stanza.bind(this));
        this._parser.on("error", this._on_stream_error.bind(this));
        this._parser.on("stream-start", this._on_stream_start.bind(this));
        this._parser.on("stream-restart", this._on_stream_restart.bind(this));
        this._parser.on("stream-end", this._on_stream_end.bind(this));
    },

    _detach_handlers_from_parser: function() {
        this._parser.removeAllListeners("stanza");
        this._parser.removeAllListeners("error");
        this._parser.removeAllListeners("stream-start");
        this._parser.removeAllListeners("stream-restart");
        this._parser.removeAllListeners("stream-end");
    },

    _starttls: function() {
        log.trace("%s %s _starttls", this._void_star.session.sid, this._void_star.name);
        // Vishnu hates 'self' - binding to 'this' _is_ definitely cleaner
        // var self = this;
        this._detach_handlers();

        var ct = require('./starttls.js')(this._sock, { }, function() {
            log.trace("%s %s _starttls - restart the stream", this._void_star.session.sid, this._void_star.name);
            // Restart the stream
            this.restart();
        }.bind(this));

        // The socket is now the cleartext stream
        this._sock = ct;

        this._attach_handlers(ATTACH_SOCKET_HANDLERS);
    },

    _get_stream_xml_open: function(stream_attrs) {
        stream_attrs = stream_attrs || { };
        var _attrs = { };
        dutil.copy(_attrs, stream_attrs);
        dutil.extend(_attrs, this._default_stream_attrs);
        return new ltx.Element('stream:stream', _attrs).toString().replace(/\/>$/, '>');
    }, 

    _on_stanza: function(stanza) {
        log.trace("%s %s _on_stanza parsed: %s", this._void_star.session.sid, 
                  this._void_star.name, dutil.replace_promise(dutil.trim_promise(stanza), '\n', ' '));

        this._prev_byte_index = this._parser.getCurrentByteIndex;

        dutil.extend(stanza.attrs, this._stream_attrs);

        // TODO: Check for valid Namespaces too.

        // dutil.log_it("DEBUG", "XMPP PROXY::Is stream:features?", stanza.is('features'));
        // dutil.log_it("DEBUG", "XMPP PROXY::logging starttls:", stanza.getChild('starttls'));

        if (stanza.is('features') && stanza.getChild('starttls')) {
            // 
            // We STARTTLS only if TLS is
            // [a] required or
            // [b] the domain we are connecting to is not present in 
            //     this._no_tls_domains
            // 
            var starttls_stanza = stanza.getChild('starttls');

            if (starttls_stanza.getChild('required') || !this._no_tls_domains[this._xmpp_host]) {
                /* Signal willingness to perform TLS handshake */
                log.trace("%s %s STARTTLS requested", this._void_star.session.sid, this._void_star.name);
                var _starttls_request = 
                    new ltx.Element('starttls', {
                        xmlns: NS_XMPP_TLS
                    }).toString();
                log.trace("%s %s Writing out STARTTLS", this._void_star.session.sid, this._void_star.name);
                this.send(_starttls_request);
            }
            else {
                stanza.remove(starttls_stanza);
                this.emit('stanza', stanza, this._void_star);
            }

        } else if (stanza.is('proceed')) {
            /* Server is waiting for TLS handshake */
            this._starttls();
            this._suppress_stream_restart_event = true;
        }
        else {
            // No it is neither. We just handle it as a normal stanza.
            this.emit('stanza', stanza, this._void_star);
        }
    },

    connect: function() {
        // console.log(this);
        if (this._firewall &&
            !dutil.can_connect(this._xmpp_host, this._firewall)) {
            this._close_connection('connection-disallowed-by-firewall-rules');
            return;
        }
        this._sock = new net.Stream();
        this._attach_handlers(SKIP_SOCKET_HANDLERS);
        this._attach_handlers_to_parser();
        this._lookup_service.connect(this._sock);
    },

    restart: function(stream_attrs) {
        var _ss_open = this._get_stream_xml_open(stream_attrs);
        this.send(_ss_open);
        this._prev_byte_index = -1;
        this._parser.restart();
    },

    terminate: function() {
        if (this._is_connected) {
            log.debug("%s %s - terminating", this._void_star.session.sid, this._void_star.name);
            // Detach the 'data' handler so that we don't get any more events.
            this._sock.removeAllListeners('data');
            this._parser.end();
            this._detach_handlers_from_parser();

            // Write the stream termination tag
            this.send("</stream:stream>");

            this._is_connected = false;

            // Do NOT detach the 'error' handler since that caused the server 
            // to crash.
            //
            // http://code.google.com/p/node-xmpp-bosh/issues/detail?id=5

            this._sock.end();
        }
        else {
            log.info("%s %s terminate - will terminate on connect", this._void_star.session.sid, this._void_star.name);
            this._terminate_on_connect = true;
        }
    },

    send: function(data) {
        if (this._is_connected) {
            try {
                this._sock.write(data);
                log.trace("%s %s Sent: %s", this._void_star.session.sid, 
                          this._void_star.name, dutil.replace_promise(dutil.trim_promise(data), '\n', ' '));
            }
            catch (ex) {
                this._is_connected = false;
                log.error("%s %s Could Not Send Data: %s", this._void_star.session.sid, 
                          this._void_star.name, dutil.replace_promise(dutil.trim_promise(data), '\n', ' '));
                // this.on_close(true, ex);
            }
        }

    }, 

    _on_connect: function() {
        log.trace("%s %s connected", this._void_star.session.sid, this._void_star.name);

        this._is_connected = true;
        delete this._lookup_service;

        if (this._terminate_on_connect) {
            this.terminate();
        }
        else {
            var _ss_open = this._get_stream_xml_open(this.stream_start_attrs);

            // Always, we connect on behalf of the real client.
            this.send(_ss_open);
            this.emit('connect', this._void_star);
        }
        this._sock.on  ('data',    us.bind(this._on_data, this));
        this._sock.once('close',   us.bind(this._on_close, this));
        this._sock.on  ('error',   dutil.NULL_FUNC);
    }, 

    _on_data: function(d) {
        log.debug("%s %s RECD %s bytes", this._void_star.session.sid, this._void_star.name, d.length);

        var stanza_size = this._parser.getCurrentByteIndex - this._prev_byte_index;

        if (stanza_size > this._max_xmpp_stanza_size) {
            log.info("%s %s _on_data: will terminate stream - the max_xmpp_stanza_size(%s) has been exceeded", 
                     this._void_star.session.sid, this._void_star.name, this._max_xmpp_stanza_size);
            this._on_stream_end();
        } else {
            this._parser.parse(d);
        }
    },

    _on_stream_start: function(attrs) {
        log.trace("%s %s stream started", this._void_star.session.sid, this._void_star.name);
        this._stream_attrs = { };
        dutil.copy(this._stream_attrs, attrs, ["xmlns:stream", "xmlns", "version"]);
    },

    _on_stream_restart: function(attrs, stanza) {
        log.trace("%s %s stream restarted", this._void_star.session.sid, this._void_star.name);
        dutil.copy(this._stream_attrs, attrs, ["xmlns:stream", "xmlns", "version"]);
        if (!this._suppress_stream_restart_event) {
            this.emit('restart', stanza, this._void_star);
        }
        this._suppress_stream_restart_event = false;
    },

    _on_stream_end: function(attr) {
        log.debug("%s %s stream terminated", this._void_star.session.sid, this._void_star.name);
        this.terminate();
    },

    _on_stream_error: function(error) {
        log.error("%s %s will terminate: %s", this._void_star.session.sid, this._void_star.name, error);
        this.terminate();
    },

    _close_connection: function(error) {
        log.debug("%s %s error: %s", this._void_star.session.sid, this._void_star.name, error);
        this.emit('close', error, this._void_star);
    },
    
    _on_close: function(had_error) {
        had_error = had_error || false;
        log.debug("%s %s error: %s", this._void_star.session.sid, this._void_star.name, !!had_error);
        this._close_connection(had_error ? 'remote-connection-failed' : null);
    },

    _on_lookup_error: function(error) {
        log.info("%s %s - %s", this._void_star.session.sid, this._void_star.name, error);
        this._close_connection(error);
    }
});

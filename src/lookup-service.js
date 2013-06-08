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

var util   = require('util');
var SRV    = require('dns-srv');
var dutil  = require('./dutil.js');
var events = require('events');
var path   = require('path');
var assert = require('assert').ok;
var us     = require('underscore');

var filename    = path.basename(path.normalize(__filename));
var log         = require('./log.js').getLogger(filename);

/* The XMPPLookupService tries to resolve the host name to connect to
 * in various ways. The order in which it tries is as follows:
 *
 * 1. Try to directly connect to a host if the route parameter is passed
 *
 * 2. Try to do an SRV record lookup for _xmpp-client._tcp record on the
 * target domain passed in as domain_name.
 *
 * A 'connect' event is raised on the 'XMPPLookupService' object if
 * the connection succeeds.  If all attempts fail, an 'error' event is
 * raised on the same object.
 *
 * Expects:
 * --------
 *
 * stream: An object that MUST have the following fields: 'to' and MAY have
 *         the following fields: 'route'
 *
 */
function XMPPLookupService(port, stream, route_filter) {
    this._domain_name = stream.to;
    this._port = port;
    this._route = stream.route;
    this._allow_connect = true;

    var _special = {
        "gmail.com": "talk.google.com",
        "chat.facebook.com": "chat.facebook.com"
    };

    if (this.hasOwnProperty('route') &&
        us.isRegExp(route_filter) &&
        this.route.host.search(route_filter) != -1) {
        this._allow_connect = false;
    }

    if (_special.hasOwnProperty(this._domain_name) &&
        !this.hasOwnProperty('_route')) {
        this._route = {
            protocol: "xmpp",
            host: _special[this._domain_name],
            port: this._port
        };
    }
}

util.inherits(XMPPLookupService, events.EventEmitter);

dutil.copy(XMPPLookupService.prototype, {
    connect: function(socket) {
        var self = this;

        if (!this._allow_connect) {
            self.emit('error', 'connection-disallowed-due-to-route-policy');
        }

        // We first save all the user's handlers.
        //
        // NOTE: NEVER re-attach OR trigger event handlers in a
        // nextTick() function. ALWAYS do it in the same tick since
        // there might be pending events and the semantics might need
        // a sequential ordering on the delivery of these events (for
        // example the 'connect' and the 'data' events need to come in
        // the order they arrived).

        function _on_socket_connected(e) {
            log.trace('Connection to %s succeeded', self._domain_name);
            // Re-trigger the connect event.
            self.emit('connect', e);
        }

        var connectors = [
            try_connect_route,
            try_connect_SRV_lookup,
            give_up_trying_to_connect
        ];

        function _connect_next() {
            var connector = connectors.shift();
            assert(connector && typeof(connector) === 'function');
            connector(_on_socket_connected, _connect_next);
        }

        function try_connect_route(on_success, on_error) {
            // First just connect to the server if this._route is defined.
            if (self._route) {
                log.trace('try_connect_route - %s:%s', self._route.host, self._route.port);
                var emitter = SRV.connect(socket, [ ], self._domain_name, self._port);

                emitter.once('connect', on_success);
                emitter.once('error',   on_error);
            }
            else {
                // Trigger the 'error' event.
                on_error();
            }
        }

        function try_connect_SRV_lookup(on_success, on_error) {
            log.trace('try_connect_SRV_lookup - %s, %s',self._domain_name, self._port);

            // Then try a normal SRV lookup.
            var emitter = SRV.connect(socket, ['_xmpp-client._tcp'],
                                      self._domain_name, self._port);

            emitter.once('connect', on_success);
            emitter.once('error',   on_error);
        }

        function give_up_trying_to_connect() {
            log.warn('Giving up connection attempts to %s', self._domain_name);
            // Trigger the error event.
            self.emit('error', 'host-unknown');
        }

        // Start the avalanche.
        _connect_next();
    }
});

exports.LookupService = XMPPLookupService;

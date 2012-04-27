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

var url   = require('url');
var ltx   = require('ltx');
var dutil = require('./dutil.js');
var us    = require('underscore');
var path  = require('path');

var toNumber   = us.toNumber;
var BOSH_XMLNS = 'http://jabber.org/protocol/httpbind';

var filename    = "[" + path.basename(path.normalize(__filename)) + "]";
var log         = require('./log.js').getLogger(filename);

// Begin packet builders
function $body(attrs) {
    attrs = attrs || { };
    var _attrs = {
        xmlns: BOSH_XMLNS
    };
    dutil.extend(_attrs, attrs);
    return new ltx.Element('body', _attrs);
}

function $terminate(attrs) {
    attrs = attrs || { };
    attrs.type = 'terminate';
    return $body(attrs);
}
// End packet builders


// Begin HTTP header helpers
function add_to_headers(dest, src) {
    var acah = dest['Access-Control-Allow-Headers'].split(', ');
    var k;
    for (k in src) {
        if (src.hasOwnProperty(k)) {
            dest[k] = src[k];
            acah.push(k);
        }
    }
    dest['Access-Control-Allow-Headers'] = acah.join(', ');
}

// End HTTP header helpers

// Begin misc. helpers
function route_parse(route) {
    /* Parse the 'route' attribute, which is expected to be of the
     * form: xmpp:domain:port.
     *
     * Returns null or a hash of the form:
     * { protocol: <PROTOCOL>, host: <HOST NAME>, port: <PORT> }
     *
     * TODO: Move this out of bosh.js and into lookup_service.js
     */
    var m = route.match(/^(\S+):(\S+):([0-9]+)$/) || [ ];
    log.trace("route_parse: %s", m);
    if (m && m.length === 4) {
        return {protocol: m[1], host: m[2], port: toNumber(m[3])};
    } else {
        return null;
    }
}

function save_terminate_condition_for_wait_time(obj, attr, condition, wait) {
    obj[attr] = {
        condition: condition,
        timer: setTimeout(function () {
            if (obj.hasOwnProperty(attr)) {
                delete obj[attr];
            }
        }, (wait + 5) * 1000)
    };
}

function get_stream_name(node) {
    return node.attrs.stream;
}

// Sanitize all attributes in node.attr that the BOSH server cares
// about.
function make_number_and_floor(x) {
    return Math.floor(toNumber(x));
}
function sanitize_request_node(node) {
    if (node.attrs.rid) {
        node.attrs.rid = make_number_and_floor(node.attrs.rid);
    }

    if (node.attrs.ack) {
        node.attrs.ack = make_number_and_floor(node.attrs.ack);
    }

    if (node.attrs.wait) {
        node.attrs.wait = make_number_and_floor(node.attrs.wait);
    }

    if (node.attrs.hold) {
        node.attrs.hold = make_number_and_floor(node.attrs.hold);
        if (node.attrs.hold < 0) node.attrs.hold = 1;
    }

    if (node.attrs.inactivity) {
        node.attrs.inactivity = make_number_and_floor(node.attrs.inactivity);
    }

    return node;
}

// Coded according to the rules mentioned here:
// http://xmpp.org/extensions/xep-0206.html#create and
// http://xmpp.org/extensions/xep-0206.html#preconditions-sasl
function is_stream_restart_packet(node) {
    var ia = dutil.inflated_attrs(node);
    return ia['urn:xmpp:xbosh:restart'] === 'true';
}

// Coded according to the rules mentioned here:
// http://xmpp.org/extensions/xep-0124.html#multi-add
function is_stream_add_request(node, piding_compatible) {
    if (piding_compatible) {
        return false;
    }
    return node.attrs.to && node.attrs.sid && node.attrs.rid &&
        !node.attrs.ver && !node.attrs.hold && !node.attrs.wait;
}

// Coded according to the rules mentioned here:
// http://xmpp.org/extensions/xep-0124.html#terminate
function is_stream_terminate_request(node) {
    return node.attrs.sid && node.attrs.rid && node.attrs.type === 'terminate';
}

// Coded according to the rules mentioned here:
// http://xmpp.org/extensions/xep-0124.html#session-request
// Even though it says SHOULD for everything we expect, we violate the XEP.
function is_session_creation_packet(node) {
    var ia = dutil.inflated_attrs(node);
    return (node.attrs.rid &&
            node.attrs.to && node.attrs.wait &&
            node.attrs.hold && !node.attrs.sid &&
            ia.hasOwnProperty('urn:xmpp:xbosh:version'));
}

// End misc. helpers

exports.add_to_headers              = add_to_headers;
exports.route_parse                 = route_parse;
exports.save_terminate_condition_for_wait_time = save_terminate_condition_for_wait_time;
exports.$terminate                  = $terminate;
exports.$body                       = $body;
exports.get_stream_name             = get_stream_name;
exports.is_stream_restart_packet    = is_stream_restart_packet;
exports.is_stream_add_request       = is_stream_add_request;
exports.is_stream_terminate_request = is_stream_terminate_request;
exports.is_session_creation_packet  = is_session_creation_packet;
exports.sanitize_request_node       = sanitize_request_node;

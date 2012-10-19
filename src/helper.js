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

var filename    = path.basename(path.normalize(__filename));
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

function JSONPResponseProxy(req, res) {
    this.req_ = req;
    this.res_ = res;
    this.has_content_length_header_ = false;
    this.response_json_ = { reply: '' };
    this.headers_ = { };
    this.status_code_ = 200;

    // Provide a getter to access the 'socket' property of this
    // response object.
    this.__defineGetter__('socket', function() {
        return this.res_.socket;
    });

    var _url = url.parse(req.url, true);
    this.jsonp_cb_ = _url.query.callback || '';
    // console.log("DATA:", _url.query.data);
    // console.log("JSONP CB:", this.jsonp_cb_);

    // The proxy is used only if this is a JSONP response
    if (!this.jsonp_cb_) {
        return res;
    }
}

JSONPResponseProxy.prototype = {
    on: function () {
        return this.res_.on.apply(this.res_, arguments);
    },
    writeHead: function (status_code, headers) {
        dutil.copy(this.headers_, headers);
        this.status_code_ = status_code;
        this.headers_['Content-Type'] = 'application/json; charset=utf-8';
    },
    write: function (data) {
        data = data || '';
        this.response_json_.reply += data;
    },
    end: function (data) {
        this.write(data);
        var data_to_write = this.jsonp_cb_ + "(" + JSON.stringify(this.response_json_) + ");";

        if (this.has_content_length_header_) {
            var content_length = Buffer.byteLength(data_to_write, 'utf8');
            this.headers_['Content-Length'] = content_length;
        }
        this.res_.writeHead(this.status_code_, this.headers_);
        this.response_json_ = null;
        return this.res_.end(data_to_write);
    }, 
    setHeader: function(name, value) {
        if (name.toLowerCase() == 'content-length') {
            this.has_content_length_header_ = true;
        } else {
            return this.res_.setHeader(name, value);
        }
    }
};
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
function sanitize_request_node(node) {
    // TODO: Implement
    if (node.attrs.rid) {
        node.attrs.rid = toNumber(node.attrs.rid);
    }

    if (node.attrs.ack) {
        node.attrs.ack = toNumber(node.attrs.ack);
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
function is_stream_add_request(node, options) {
    if (options.PIDGIN_COMPATIBLE) {
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
exports.JSONPResponseProxy          = JSONPResponseProxy;
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

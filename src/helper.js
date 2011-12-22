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

var url = require('url');
var ltx = require('ltx');
var dutil = require('./dutil.js');
var us = require('underscore');


var toNumber = us.toNumber;
var log_it = dutil.log_it;
var BOSH_XMLNS = 'http://jabber.org/protocol/httpbind';


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
    this.wrote_ = false;

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
        var _headers = { };
        dutil.copy(_headers, headers);
        _headers['Content-Type'] = 'application/json; charset=utf-8';
        return this.res_.writeHead(status_code, _headers);
    },
    write: function (data) {
        if (!this.wrote_) {
            this.res_.write(this.jsonp_cb_ + '({"reply":"');
            this.wrote_ = true;
        }

        data = data || '';
        data = data.replace(/\n/g, '\\n').replace(/"/g, '\\"');
        return this.res_.write(data);
    },
    end: function (data) {
        this.write(data);
        if (this.jsonp_cb_) {
            this.res_.write('"});');
        }
        return this.res_.end();
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
    log_it("DEBUG", "BOSH::route_parse:", m);
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

// Coded according to the rules mentioned here:
// http://xmpp.org/extensions/xep-0206.html#create and
// http://xmpp.org/extensions/xep-0206.html#preconditions-sasl
function is_stream_restart_packet(node) {
    var ia = dutil.inflated_attrs(node);
    return ia['urn:xmpp:xbosh:restart'] === 'true';
}

// Coded according to the rules mentioned here:
// http://xmpp.org/extensions/xep-0124.html#multi-add
function is_stream_add_request(node) {
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
    return node.attrs.to &&
        node.attrs.wait &&
        node.attrs.hold && !node.attrs.sid &&
        ia.hasOwnProperty('urn:xmpp:xbosh:version');
}

// End misc. helpers

exports.add_to_headers = add_to_headers;
exports.JSONPResponseProxy = JSONPResponseProxy;
exports.route_parse = route_parse;
exports.save_terminate_condition_for_wait_time = save_terminate_condition_for_wait_time;
exports.$terminate = $terminate;
exports.$body = $body;
exports.get_stream_name = get_stream_name;
exports.is_stream_restart_packet = is_stream_restart_packet;
exports.is_stream_add_request = is_stream_add_request;
exports.is_stream_terminate_request = is_stream_terminate_request;
exports.is_session_creation_packet = is_session_creation_packet;
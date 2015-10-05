"use strict";

var dutil = require('./dutil.js');
var path  = require('path');

var filename = path.basename(path.normalize(__filename));
var log      = require('./log.js').getLogger(filename);

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

function BOSHHeaders(options) {
    var _options = options;

    var _echo_origin_in_cors_header = _options.echo_origin_in_cors_header || false;
    log.debug('ECHO_ORIGIN_IN_CORS_HEADER: %s', _echo_origin_in_cors_header);

    var _default_headers = {};
    _default_headers['GET'] = {
        'Content-Type': 'text/html; charset=UTF-8',
        'Cache-Control': 'no-cache, no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, x-requested-with, Set-Cookie',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Max-Age': '14400'
    };
    _default_headers['POST'] = {
        'Content-Type': 'text/xml; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, x-requested-with, Set-Cookie',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Max-Age': '14400'
    };
    _default_headers['OPTIONS'] = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, x-requested-with, Set-Cookie',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Max-Age': '14400'
    };

    if (_options.http_headers) {
        add_to_headers(_default_headers['GET'], _options.http_headers);
        add_to_headers(_default_headers['POST'], _options.http_headers);
        add_to_headers(_default_headers['OPTIONS'], _options.http_headers);
    }

    ['GET', 'POST', 'OPTIONS'].forEach(function(method) {
        var headers = _default_headers[method];
        Object.keys(headers).forEach(function(header_key) {
            log.debug('HTTP_RESPONSE_HEADERS:%s::%s => %s', method, header_key, headers[header_key]);
        })
    });

    this.make_headers = function(http_method, request_headers) {
        var _headers = {};
        dutil.copy(_headers, _default_headers[http_method]);

        if (_echo_origin_in_cors_header && request_headers['origin']) {
            _headers['Access-Control-Allow-Origin'] = request_headers['origin'];
        }

        return _headers;
    }
}

exports.BOSHHeaders = BOSHHeaders;

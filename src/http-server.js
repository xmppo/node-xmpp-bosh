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

var url          = require('url');
var http         = require('http');
var util         = require('util');
var _            = require('underscore');
var events       = require('events');
var helper       = require('./helper.js');
var EventPipe    = require('eventpipe').EventPipe;

var path        = require('path');
var filename    = "[" + path.basename(path.normalize(__filename)) + "]";
var log         = require('./log.js').getLogger(filename);

var BoshRequestParser = require('./bosh-request-parser').BoshRequestParser;

function BOSHServer(config) {
    this._config = config;
    this._host = config.host;
    this._port = config.port;
    this._path = config.path;
    events.EventEmitter.apply(this);
}

util.inherits(BOSHServer, events.EventEmitter);

BOSHServer.prototype.start = function () {
    this._start_time = new Date();
    this._setup_router();
    this._http_server = http.createServer();
    this._http_server.on('request', this._request_handler.bind(this));
    this._http_server.on('error', this._error_handler.bind(this));
    this._http_server.listen(this._port, this._host);
};

BOSHServer.prototype._setup_router = function () {
    // All request handlers return 'false' on successful handling
    // of the request and 'undefined' if they did NOT handle the
    // request. This is according to the EventPipe listeners API
    // expectation.

    this._request_router = new EventPipe();
    this._request_router.on('request', this._handle_post_bosh_request.bind(this), 1)
    .on('request', this._handle_get_bosh_request.bind(this), 2)
    .on('request', this._handle_options.bind(this), 3)
    .on('request', this._handle_get_favicon.bind(this), 4)
    .on('request', this._handle_get_statistics.bind(this), 5)
    .on('request', this._handle_get_crossdomainXML.bind(this), 6)
    .on('request', this._handle_unhandled_request.bind(this), 7);
};

BOSHServer.prototype._request_handler = function (req, res) {
    var u = url.parse(req.url, true);
    log.trace("Processing %s request at location: %s", req.method, u.pathname);
    this._request_router.emit('request', req, res, u);
};

BOSHServer.prototype._error_handler = function (ex) {
    // following the node paradigm.
    this.emit("error", util.format('ERROR on listener at endpoint: http://%s:%s%s',
                    this._host, this._port, this._path));
};

BOSHServer.prototype._handle_post_bosh_request = function (req, res, u) {
    var ppos = u.pathname.search(this._path);
    if (req.method !== 'POST' || ppos === -1) {
        return;
    }

    var end_timeout;
    var bosh_request_parser = new BoshRequestParser();
    var process_request = function (error) {
        clearTimeout(end_timeout)
        if (error) {
            log.warn("%s - destroying connection from '%s'", error, req.socket.remoteAddress);
            req.destroy();
            return;
        }
        var body = bosh_request_parser.parsedBody;
        log.debug("RECD: %s", body);
        if (!body) {
            res.writeHead(200, this._config.HTTP_POST_RESPONSE_HEADERS);
            res.end(helper.$terminate({ condition: 'bad-request' }).toString());
        }
        else {
            this.emit('bosh-request', body);
        }

        if (bosh_request_parser) {
            bosh_request_parser.end();
            bosh_request_parser = null;
        }
    };

    var write_to_parser = function (d) {
        if (!bosh_request_parser.parse(d)) {
            process_request(new Error("Parse Error"), null);
        };
    };

    end_timeout = setTimeout(function () {
        process_request(new Error("Timed Out"));
    }, 20 * 1000);
        
    // Add abuse prevention.
    req.on('data', write_to_parser);
    req.once('end', process_request);
    req.on('error', function (ex) {
        log.error("Exception '" + ex.toString() + "' while processing request");
        log.error("Stack Trace: %s\n", ex.stack);
    });

    return false;
};

// TODO: Read off the Headers request from the request and set that in the
// response.
BOSHServer.prototype._handle_get_bosh_request = function (req, res, u) {
    var ppos = u.pathname.search(this._config.path);
    if (req.method === 'GET' && ppos !== -1 && u.query.hasOwnProperty('data')) {
        res = new helper.JSONPResponseProxy(req, res);
        this.emit('bosh-request', res, u.query.data || '');
        return false;
    }
};

BOSHServer.prototype._handle_options = function (req, res, u) {
    if (req.method === 'OPTIONS') {
        res.writeHead(200, this._config.HTTP_OPTIONS_RESPONSE_HEADERS);
        res.end();
        return false;
    }
};

BOSHServer.prototype._handle_get_favicon = function (req, res, u) {
    if (req.method === 'GET' && u.pathname === '/favicon.ico') {
        res.writeHead(303, {
            'Location': 'http://xmpp.org/favicon.ico'
        });
        res.end();
        return false;
    }
};

BOSHServer.prototype._handle_get_statistics = function (req, res, u) {
    var ppos = u.pathname.search(this._config.path);
    if (req.method === 'GET' && ppos !== -1 && !u.query.hasOwnProperty('data')) {
        res.writeHead(200, this._config.HTTP_GET_RESPONSE_HEADERS);
        // find a better way to get stats
        // var stats = stat_func();
        res.end("NO STATS RT NOW");
        return false;
    }
};

// http://code.google.com/p/node-xmpp-bosh/issues/detail?id=22
// Supporting cross-domain requests through the addition of flash. This will be necessary
// if you use the plug strophe.flxhr.js for the library strophe.
//
BOSHServer.prototype._handle_get_crossdomainXML = function (req, res, u) {
    if (req.method === 'GET' && req.url === "/crossdomain.xml") {
        res.writeHead(200, this._config.HTTP_GET_RESPONSE_HEADERS);
        var crossdomain = '<?xml version="1.0"?>';
        crossdomain += '<!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd">';
        crossdomain += '<cross-domain-policy>';
        crossdomain += '<site-control permitted-cross-domain-policies="all"/>';
        crossdomain += '<allow-access-from domain="*" to-ports="' + this._config.port + '" secure="true"/>';
        crossdomain += '<allow-http-request-headers-from domain="*" headers="*" />';
        crossdomain += '</cross-domain-policy>';
        res.end(crossdomain);
        return false;
    }
};

function get_statistics() {
    var stats = [ ];
    stats.push('<?xml version="1.0" encoding="utf-8"?>');
    stats.push('<!DOCTYPE html>');
    var content = new ltx.Element('html', {
        'xmlns':    'http://www.w3.org/1999/xhtml',
        'xml:lang': 'en'
    })
            .c('head')
            .c('title').t('node-xmpp-bosh').up()
            .up()
            .c('body')
            .c('h1')
            .c('a', {'href': 'https://github.com/dhruvbird/node-xmpp-bosh'})
            .t('node-xmpp-bosh')
            .up()
            .up()
            .c('h3').t('Bidirectional-streams Over Synchronous HTTP').up()
            .c('p').t(sprintf('Uptime: %s', dutil.time_diff(started, new Date()))).up()
            .c('p').t(sprintf('%s/%s active %s', session_store.get_active_no(),
                              session_store.get_total_no(),
                              dutil.pluralize(session_store.get_total_no(), 'session'))).up()
            .c('p').t(sprintf('%s/%s active %s', stream_store.get_active_no(),
                              stream_store.get_total_no(),
                              dutil.pluralize(stream_store.get_total_no(), 'stream'))).up()
            .tree();
    stats.push(content.toString());
    return stats.join('\n');
}

BOSHServer.prototype._handle_unhandled_request = function (req, res, u) {
    log.trace("Invalid request, method: %s path: %s", req.method, u.pathname);
    var _headers = { };
    _.copy(_headers, this._config.HTTP_POST_RESPONSE_HEADERS);
    _headers['Content-Type'] = 'text/plain; charset=utf-8';
    res.writeHead(404, _headers);
    res.end();
    return false;
};

exports.BOSHServer = BOSHServer;

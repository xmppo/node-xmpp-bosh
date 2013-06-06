// -*-  tab-width:4  -*-

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

var ltx    = require('ltx');
var util   = require('util');
var events = require('events');
var dutil  = require('./dutil.js');
var expat  = require('node-expat');

function XmppStreamParser() {
    events.EventEmitter.apply(this);

    this.__defineGetter__("getCurrentByteIndex", function () {
        return this._parser ? this._parser.getCurrentByteIndex() : 0;
    });

    this._start();
}

util.inherits(XmppStreamParser, events.EventEmitter);

dutil.copy(XmppStreamParser.prototype, {
    _handle_start_element: function(name, attrs) {
        if (!this._started) {
            if (name === "stream:stream") {
                this._started = true;
                this.emit("stream-start", attrs);
            } else {
                this.emit("error", "stanza w/o stream-start");
                this.end();
            }
        } else {
            var stanza = new ltx.Element(name, attrs);
            if (name === "stream:stream") {
                this.emit("stream-restart", attrs, stanza);
            } else {
                if (this.stanza) {
                    this.stanza = this.stanza.cnode(stanza);
                } else {
                    this.stanza = stanza;
                }
            }
        }
    },

    _handle_end_element: function(name, attrs) {
        if (name === "stream:stream") {
            this.emit("stream-end", attrs);
            this.end();
            return;
        }

        if (this.stanza) {
            if (this.stanza.parent) {
                this.stanza = this.stanza.parent;
            } else {
                this.emit("stanza", this.stanza);
                delete this.stanza;
            }
        } else {
            // This happens at times.
            this.emit("error", "end-element w/o start");
            this.end();
        }
    },

    _handle_text: function(txt) {
        // top level text nodes are
        // ignored. (not valid in xmpp).
        if (this.stanza) {
            this.stanza.t(txt);
        }
    },

    _handle_entity_decl: function() {
        this.emit("error", "entity-decl-not-allowed");
        this.end();
    },

    parse: function(data) {
        if (this._parser && !this._parser.parse(data)) {
            // in case the parser is deleted on end-stream
            // and there is garbage after that.
            if (this._parser) {
                this.emit("error", this._parser.getError());
            }
        }
    },

    _start: function () {
        this._parser = new expat.Parser('UTF-8');
        this._started = this._started || false;

        this._parser.on("text", this._handle_text.bind(this));
        this._parser.on("endElement", this._handle_end_element.bind(this));
        this._parser.on("entityDecl", this._handle_entity_decl.bind(this));
        this._parser.on("startElement", this._handle_start_element.bind(this));
    },

    end: function() {
        if (this._parser) {
            this._parser.stop();
            this._parser.removeAllListeners();
            delete this._parser;
        }
    },

    restart: function() {
        this.end();
        this._start();
    }
});

exports.XmppStreamParser = XmppStreamParser;

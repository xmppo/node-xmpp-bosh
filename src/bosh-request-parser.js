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

var ltx    = require('ltx');
var util   = require('util');
var dutil  = require('./dutil.js');
var expat  = require('node-expat');

function BoshRequestParser() {
    this._parser = new expat.Parser('UTF-8');
    this._started = false;
    this.parsedBody = null;

    this._parser.on("text", this._handle_text.bind(this));
    this._parser.on("endElement", this._handle_end_element.bind(this));
    this._parser.on("entityDecl", this._handle_entity_decl.bind(this));
    this._parser.on("startElement", this._handle_start_element.bind(this));
}

dutil.copy(BoshRequestParser.prototype, {
    _handle_start_element: function(name, attrs) {
        if (!this._started) {
            if (name === "body") {
                this._started = true;
            } else {
                this.end();
                return;
            }
        } 

        var stanza = new ltx.Element(name, attrs);
        if (this.stanza) {
            this.stanza = this.stanza.cnode(stanza);
        } else {
            this.stanza = stanza;
        }
    },

    _handle_end_element: function(name, attrs) {
        if (this.stanza && this.stanza.parent) {
            this.stanza = this.stanza.parent;
        } else if (this.stanza) {
            this.parsedBody = this.stanza;
            delete this.stanza;
        } else {
            // this happens some-times.
            this.end();
        }
    },

    _handle_text: function(txt) {
        // only text nodes inside body are considered.
        if (this.stanza) {
            this.stanza.t(txt);
        }
    },

    _handle_entity_decl: function() {
        this.end();
    },

    parse: function(data) {
        if (this._parser && !this._parser.parse(data)) {
            this.end();
            return false;
        }
        else if (!this._parser) {
            return false;
        }
        return true;
    },

    end: function() {
        if (this._parser) {
            this._parser.stop();
            this._parser.removeAllListeners();
            if (this._stanza) {
                delete this._stanza;
            }
            if (this.parsedBody) {
                delete this.parsedBody;
            }
            delete this._parser;
        }
    }
});

exports.BoshRequestParser = BoshRequestParser;
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

var ltx      = require('ltx');
var util     = require('util');
var dutil    = require('./dutil.js');
var expat    = require('node-expat');
var assert   = require('assert').ok;
var path     = require('path');

var filename = path.basename(path.normalize(__filename));
var log      = require('./log.js').getLogger(filename);

function BoshRequestParser() {
    this._parser = new expat.Parser('UTF-8');
    this.init_state_();
}

dutil.copy(BoshRequestParser.prototype, {
    /* Initialize the internal state (variables) of the parser */
    init_state_: function() {
        this._parser.removeAllListeners();
        this._parser.parse("<bosh>");

        this.started_   = false;
        this.parsedBody = null;
        if (this.hasOwnProperty('stanza')) {
            delete this.stanza;
        }

        // Always attach handlers after starting the <bosh> tag.
        this._parser.on("text", this._handle_text.bind(this));
        this._parser.on("endElement", this._handle_end_element.bind(this));
        this._parser.on("entityDecl", this._handle_entity_decl.bind(this));
        this._parser.on("startElement", this._handle_start_element.bind(this));
    },

    /* Reset the underlying expat parser and internal state. Do NOT
     * call this method after calling end() on the parser.
     */
    reset: function() {
        log.debug("Reseting parser state");
        this._parser.reset();
        this.init_state_();
    },

    _handle_start_element: function(name, attrs) {
        if (!this.started_) {
            // The first node MUST be <DUMMY>.
            assert(name === 'DUMMY');
            this.started_ = true;
        }

        var stanza = new ltx.Element(name, attrs);
        if (this.stanza) {
            this.stanza = this.stanza.cnode(stanza);
        } else {
            this.stanza = stanza;
        }
    },

    _handle_end_element: function(name, attrs) {
        if (this.stanza) {
            if (this.stanza.parent) {
                // Expat has already verified that the closing tag
                // matches the corresponding opening tag, so we need
                // not check that again.
                this.stanza = this.stanza.parent;
            } else {
                this.parsedBody = this.stanza;
                delete this.stanza;
            }
        } else {
            // The user tried to close the top level <bosh> tag. We
            // set this.parsedBody to null to indicate that we
            // encountered a parsing error. If the user sent XML like:
            // <body/></DUMMY></bosh><DUMMY> then expat will fail to
            // parse the part after </bosh> and will return 'false' in
            // the parse() method (as discussed with
            // @satyamshekhar). We don't do anything else since the
            // caller will reset() the parser.
            this.parsedBody = null;
        }
    },

    _handle_text: function(txt) {
        // only text nodes inside body are considered.
        if (this.stanza) {
            this.stanza.t(txt);
        }
    },

    _handle_entity_decl: function() {
        // this.end();
        // We ignore all entity declarations.
        this.reset();
    },

    /* parse() may be passed incomplete stanzas, but finally a check
     * is made to see if parsedBody is non-null. If it is, we reset
     * the parser.
     */
    parse: function(data) {
        this.parsedBody = null;
        if (this._parser && !this._parser.parse(data)) {
            return false;
        }
        else if (!this._parser) {
            // end() was called on this parser already.
            return false;
        }
        return true;
    },

    /* Ends parsing and destroys the underlying parser. Do NOT call
     * any other method on this object after calling end().
     */
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
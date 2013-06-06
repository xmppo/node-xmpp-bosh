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

var us       = require('underscore');
var path     = require('path');
var assert   = require('assert').ok;

var filename = path.basename(path.normalize(__filename));
var log      = require('./log.js').getLogger(filename);

// The maximum number of characters that a single log line can contain
var TRIM_DEFAULT_LENGTH = 256;

function arguments_to_array(args) {
	return Array.prototype.slice.call(args, 0);
}

function copy(dest, src, restrict) {
	/* Copy keys from the hash 'src' to the hash 'dest'.
	 * If restrict is truthy, then it should be an array
	 * that contains the keys to be copied.
	 */
	var k;
	for (k in src) {
		if (src.hasOwnProperty(k)) {
			if (restrict) {
				if (restrict.indexOf(k) !== -1) {
					dest[k] = src[k];
				}
			}
			else {
				dest[k] = src[k];
			}
		}
	}
	return dest;
}

function extend(dest, src, restrict) {
	/* Extend the hash 'dest' with keys & values from the 
	 * hash 'src'. If a key is already present in 'dest', 
	 * don't overrite it with one from 'src'. If 'restrict' is an
	 * array of strings, only override keys that match a string in
	 * 'restrict'.
	 */
	var k;
	for (k in src) {
		if (src.hasOwnProperty(k)) {
			if (!dest.hasOwnProperty(k)) {
			    if (restrict) {
				    if (restrict.indexOf(k) !== -1) {
					    dest[k] = src[k];
				    }
                }
			    else {
                    dest[k] = src[k];
			    }
			}
		}
	}
	return dest;
}


function repeat(item, n) {
	/* Return an array that contains 'item' 'n' times.
	 * Note: 'item' is not deep copied, only the reference
	 * is assigned 'n' times. Modifying it via member 
	 * functions will result in all elements of the returned
	 * array being modified.
	 */
	var ret = [];
	var i;
	for (i = 0; i < n; ++i) {
		ret.push(item);
	}
	return ret;
}

function alternator() {
	/* Accepts a variable number of arrays.
	 *
	 * e.g. alternator([1,2,3,4], [10, 20, 30]) will return
	 * [1,10,2,20,3,30,40] and
	 *
	 * alternator([1,2,3,4], [10, 20]) will return
	 * [1,10,2,20,3,4]
	 *
	 * Basically, it tries to alternate between the various arrays
	 * if there are any remaining elements in any of them. Returns the
	 * alternated array.
	 */
	var nseq = arguments.length;
	var exhausted = false;
	var buff = [];
	var ctrs = repeat(0, nseq);
	var i;

	while (!exhausted) {
		exhausted = true;
		for (i = 0; i < nseq; ++i) {
			if (ctrs[i] < arguments[i].length) {
				buff.push(arguments[i][ctrs[i]]);
				ctrs[i] += 1;
				exhausted = false;
			}
		}
	}

	return buff;
}

function map(a, f) {
	// Apply 'f' [with 2 arguments (element, index)] or call member function 'f' [with no arguments]
	var r = [ ];
	var i;
	for (i = 0; i < a.length; ++i) {
		if (typeof f === 'function') {
			r.push(f(a[i], i));
		}
		else if (typeof f === 'string') {
			r.push(a[i][f]());
		}
	}
	return r;
}

function sprintf(fmt_str) {
	var fs_parts = fmt_str.split("%s");
	var args = map(arguments_to_array(arguments).slice(1), 'toString');

	if (fs_parts.length !== args.length + 1) {
		var estr = sprintf("The number of arguments in your format string (%s)[%s] " + 
			"does NOT match the number of arguments passed[%s]", 
			fmt_str, fs_parts.length-1, args.length);
		log.warn("%s", estr);
		throw new Error(estr);
	}

	return us(fs_parts).chain().zip(us(args).push('')).flatten().value().join('');
}

function ToStringPromise(proc, args) {
	this._proc = proc;
	this._args = args || [ ];
}

ToStringPromise.prototype = {
	toString: function(obj) {
		obj = obj || null;
		return this._proc.apply(obj, this._args);
	}
};


// Delayed sprintf()
function sprintfd() {
	return new ToStringPromise(sprintf, arguments);
}

function replace_promise(s, victim, replacement) {
    return new ToStringPromise(function() {
        if (typeof(s) !== "string") {
            s = String(s);
        }
        var re = victim;
        if (typeof(victim) === 'string') {
            re = new RegExp(victim, 'g');
        }
        return s.replace(re, replacement);
    });
}

function trim_promise(s, len) {
    return new ToStringPromise(function() {
        if (typeof(len) === 'undefined') {
            len = TRIM_DEFAULT_LENGTH;
        }
        assert(typeof(len) === 'number');
        if (typeof(s) !== "string") {
            s = String(s);
        }
        if (len < 0 || s.length <= len) {
            return s;
        }
        var diff = s.length - len;
        return String(s).substr(0, len) + "... [" + diff + " more " + pluralize(diff, "character") + "]";
    }, [ ]);
}

function not(proc) {
	return function() {
		return !proc.apply(this, arguments);
	};
}

function rev_hash(o) {
	var r = { };
	var k;
	for (k in o) {
		if (o.hasOwnProperty(k)) {
			r[o[k]] = k;
		}
	}
	return r;
}

function _real_xml_parse(xml, ltx) {
	/* This function parses the XML stanza passed to it
	 * as a string. 'ltx' is the ltx module object. It is used
	 * to do the actual XML parsing. null is returned if the 
	 * string passed is NOT valid XML.
	 *
	 * Note: The string 'xml' is trimmed before parsing.
	 */
	var node = null;
	xml = xml.trim();
	if (!xml) {
		return node;
	}

	try {
		node = ltx.parse(xml);
	}
	catch (ex) {
        log.warn("_real_xml_parse::Error (%s) parsing XML: %s", String(ex), xml);
		log.warn("%s", ex.stack);
	}
	return node;
}

function _xml_parse() {
	/* Returns a function that parses the XML stanza passed to it
	 * as a string.
	 */
	var ltx = null;

	return function(xml) {
		// We do the dynamic require() of the 'ltx' module since 
		// it is required be present on only those systems that actually
		// use this function.
		if (!ltx) {
			ltx = require('ltx');
		}
		return _real_xml_parse(xml, ltx);
	};
}

function isFalsy(x) {
	return !x;
}

function isTruthy(x) {
	return !isFalsy(x);
}



function json_parse(jstr, def) {
	def = typeof def === 'undefined' ? '' : def;
	try {
		def = JSON.parse(jstr);
	}
	catch (ex) { }
	return def;
}

function jid_parse(jid) {
	/* Parses a full JID and returns an object containing 3 fields:
	 *
	 * username: The part before the @ sign
	 * domain  : The domain part of the JID (between @ and /)
	 * resource: The resource of the JID. May be undefined if not set
	 *
	 */
	var parts = jid.match(/^([^@]+)@([^\/]+)(\/([\S]+))?$/);
	if (!parts || !(parts instanceof Array) || parts.length < 5) {
		parts = repeat('', 5);
	}

	return {
		username: parts[1], 
		domain:   parts[2], 
		resource: parts[4]
	};
}

function num_cmp(lhs, rhs) {
	return lhs - rhs;
}

function time_diff(past, present) {
	/* Returns a humanly readable difference between 2 Date objects
	 *
	 * Specifically, it returns the difference (present - past)
	 *
	 * If present < past then the results are not defined
	 *
	 * Example Return: 3 day 10:23:33
	 *
	 */
	var diff = Math.floor((present - past) / 1000);

	var mapping = [
		[ 'year', 365 * 24 * 3600 ], 
		[ 'month', 30 * 24 * 3600 ], 
		[ 'week', 7 * 24 * 3600 ], 
		[ 'day', 1 * 24 * 3600 ], 
		[ ':', 3600 ], 
		[ ':', 60 ], 
		[ '', 1 ]
	];

	var out = mapping.map(function(v) {
		var r = [ v[0], Math.floor(diff / v[1]) ];
		diff %= v[1];
		return r;
	})
	.filter(function(v) {
		return v[0] !== ':' && v[0] !== '' ? v[1] > 0 : true;
	})
	.map(function(v) {
		return v[0] !== ':' && v[0] !== '' ? 
			(v[1] + ' ' + v[0] + (v[1] > 1 ? 's' : '') + ' ') : 
			((v[1] < 10 ? '0' : '') + v[1] + v[0]);
	})
	.join('');

	return out;
}

function ends_with(haystack, needle) {
	/* Checks whether the string haystack ends with the string
	 * needle
	 *
	 */
	return (needle.length <= haystack.length ?
            haystack.substring(haystack.length - needle.length) === needle :
            false);
}

function find_module(file_name) {
	/* Searches for a module that ends with file_name
	 *
	 * Returns an object with 2 attributes
	 * handle: The handle to the require()d module and
	 * key   : The full absolute path of the module
	 *
	 * If the module was not found, then handle is null
	 *
	 */
	var mhandle = { handle: null, key: '' };
	var mname;
	for (mname in require.cache) {
		if (require.cache.hasOwnProperty(mname)) {
			if (ends_with(mname, "/" + file_name)) {
				mhandle.handle = require.cache[mname].exports;
				mhandle.key    = mname;
				break;
			}
		}
	}
	return mhandle;
}


function require_again(file_path) {
	/* This function require()s a file again.
	 * 
	 * Arguments:
	 * file_path: The complete (full absolute) path of the file to be require()d.
	 *
	 * It does this by deleting the older handle to the module from require.cache
	 * and calling require()ing the file_path
	 *
	 */
	var old_mhandle = find_module(file_path);
	if (old_mhandle.key) {
		delete require.cache[old_mhandle.key];
	}
	return require(file_path);
}

function pluralize(n, suffix) {
	return n == 1 ? suffix : suffix + 's';
}

function toNumber(s) {
	var _n = Number(s);
	return isNaN(_n) ? 0 : _n;
}

function inflated_attrs(node) {
	// 
	// This function expands XML attribute namespaces and helps us 
	// lookup fully qualified XML attributes
	//
	// It returns a list of fully qualified attributes for the node
	// that is passed to it
	//
	var xmlns = { };
	var attrs = { };
	var k, m;
	var re = new RegExp("^([^:]+):([\\s\\S]+)$");

	for (k in node.attrs) {
		if (node.attrs.hasOwnProperty(k)) {
			m = k.match(/^xmlns:([\S\s]+)$/);
			if (m && m.length > 0) {
				xmlns[m[1]] = node.attrs[k];
				attrs[k] = node.attrs[k];
			}
		}
	}

	for (k in node.attrs) {
		if (node.attrs.hasOwnProperty(k)) {
			// Extract the bit before the : and check if it is present in xmlns
			m = k.match(re);
			// console.log("m:", m);
			if (m && m.length === 3 && xmlns.hasOwnProperty(m[1])) {
				attrs[xmlns[m[1]] + ":" + m[2]] = node.attrs[k];
			}

		} // if (node.attrs.hasOwnProperty(k))

	}

	return attrs;
}

function list_includes(needle, haystack) {
	var i;
	for (i = 0; i < haystack.length; ++i) {
		if (us.isRegExp(haystack[i])) {
			if (needle.search(haystack[i]) != -1) {
				return true;
			}
		} else if (us.isString(haystack[i])) {
			if (haystack[i] == needle) {
				return true;
			}
		} else {
			throw new Error("Array element '" + i + "' should be either a RegExp or a String");
		}
	}
	return false;
}

function can_connect(host, firewall) {
	if (!firewall) {
		return true;
	}
	var has_allow = firewall.hasOwnProperty('allow') &&
		firewall.allow instanceof Array;
	var has_deny  = firewall.hasOwnProperty('deny') &&
		firewall.deny instanceof Array;
	switch (has_allow + has_deny) {
	case 0:
		return true;
	case 1:
	case 2:
		if (has_allow) {
			return list_includes(host, firewall.allow);
		}
		assert(has_deny != 0);
		return !list_includes(host, firewall.deny);
	}
}

// Add the following to underscore.js
us.mixin({
	isTruthy: isTruthy, 
	isFalsy: isFalsy, 
	toNumber: toNumber, 
	not: not
});


// Define a getter & setter to get & set TRIM_DEFAULT_LENGTH
exports.__defineGetter__("TRIM_DEFAULT_LENGTH", function() {
    return TRIM_DEFAULT_LENGTH;
});

exports.__defineSetter__("TRIM_DEFAULT_LENGTH", function(def_trim_length) {
    if (typeof(def_trim_length) === 'string') {
        def_trim_length = toNumber(def_trim_length);
    }
    if (typeof(def_trim_length) !== 'number') {
        def_trim_length = TRIM_DEFAULT_LENGTH;
    }
    TRIM_DEFAULT_LENGTH = def_trim_length || TRIM_DEFAULT_LENGTH;
});

exports.copy               = copy;
exports.extend             = extend;
exports.repeat             = repeat;
exports.alternator         = alternator;
exports.arguments_to_array = arguments_to_array;
exports.map                = map;
exports.sprintf            = sprintf;
exports.sprintfd           = sprintfd;
exports.rev_hash           = rev_hash;
exports.xml_parse          = _xml_parse();
exports.set_log_level      = require("./log.js").set_log_level;
exports.json_parse         = json_parse;
exports.jid_parse          = jid_parse;
exports.num_cmp            = num_cmp;
exports.time_diff          = time_diff;
exports.ends_with          = ends_with;
exports.find_module        = find_module;
exports.require_again      = require_again;
exports.pluralize          = pluralize;
exports.inflated_attrs     = inflated_attrs;
exports.list_includes      = list_includes;
exports.can_connect        = can_connect;
exports.trim_promise       = trim_promise;
exports.replace_promise    = replace_promise;
exports.NULL_FUNC          = function() { };

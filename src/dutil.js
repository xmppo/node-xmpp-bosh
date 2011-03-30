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

function copy(dest, src, restrict) {
	/* Copy keys from the hash 'src' to the hash 'dest'.
	 * If restrict is truthy, then it should be an array
	 * that contains the keys to be copied.
	 */
	for (var k in src) {
		if (restrict) {
			if (restrict.indexOf(k) != -1) {
				dest[k] = src[k];
			}
		}
		else {
			dest[k] = src[k];
		}
	}
	return dest;
}

function extend(dest, src) {
	/* Extend the hash 'dest' with keys & values from the 
	 * hash 'src'. If a key is already present in 'dest', 
	 * don't overrite it with one from 'src'.
	 */
	for (var k in src) {
		if (!(k in dest)) {
			dest[k] = src[k];
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
	for (var i = 0; i < n; ++i) {
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

	while (!exhausted) {
		exhausted = true;
		for (var i = 0; i < nseq; ++i) {
			if (ctrs[i] < arguments[i].length) {
				// log_it('debug', "Adding to buff:", arguments[i][ctrs[i]]);
				buff.push(arguments[i][ctrs[i]]);
				ctrs[i] += 1;
				exhausted = false;
			}
		}
	}

	return buff;
}

function arguments_to_array(args) {
	return Array.prototype.slice.call(args, 0);
}

function map(a, f) {
	// Apply 'f' [with 2 arguments (element, index)] or call member function 'f' [with no arguments]
	var r = [ ];
	for (var i = 0; i < a.length; ++i) {
		if (typeof f == "function") {
			r.push(f(a[i], i));
		}
		else if (typeof f == "string") {
			r.push(a[i][f]());
		}
	}
	return r;
}

function sprintf(fmt_str) {
	// log_it('debug', "sprintf", arguments);
	var fs_parts = fmt_str.split("%s");
	var args = map(arguments_to_array(arguments).slice(1), 'toString');

	// log_it('debug', "fs_parts, args:", fs_parts, args);

	if (fs_parts.length != args.length + 1) {
		log_it("WARN", sprintf("The number of arguments in your format string (%s)[%s] " + 
			"does NOT match the number of arguments passed [%s]", 
			fmt_str, fs_parts.length-1, args.length));
	}
	return alternator(fs_parts, args).join("");
}

function once(proc) {
	/* Ensure that 'proc' is called only once, irrespective of how many 
	* times the wrapping (outer) procedure is called.
	*/
	var _fired = false;
	var _ret = null;

	return function() {
		if (!_fired) {
			_fired = true;
			_ret = proc.apply(null, arguments);
		}
		return _ret;
	};
}

function hitch(obj, proc) {
	return function() {
		return proc.apply(obj, arguments);
	};
}

function not(proc) {
	return function() {
		return !proc.apply(this, arguments);
	};
}

function get_keys(o) {
	var r = [ ];
	for (var k in o) {
		r.push(k);
	}
	return r;
}

function rev_hash(o) {
	var r = { };
	for (var k in o) {
		r[o[k]] = k;
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
		log_it("WARN", "_real_xml_parse::Error parsing XML:", xml, ex.toString());
		log_it("WARN", ex.stack);
	}
	return node;
}

function _xml_parse() {
	/* Returns a function that parses the XML stanza passed to it
	 * as a string.
	 */
	var ltx = null;

	return function(xml) {
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


var _log_level = 1;
var _log_levels = {
	"NONE": 0, 
	"INFO": 1, 
	"WARN": 2, 
	"DEBUG": 3,
	"ERROR": 4,
	"FATAL": 5
};


function get_numeric_log_level(level) {
	level = level.toUpperCase();
	var nll = 6;

	if (level in _log_levels) {
		nll = _log_levels[level];
	}

	return nll;
}
	
function set_log_level(level) {
	_log_level = get_numeric_log_level(level);
}

function log_it(level) {
	/* Logs stuff (2nd parameter onwards) according to the logging level
	 * set using the set_log_level() function. The default logging level
	 * is INFO logging only. The order of logging is as follows:
	 * NONE < INFO < WARN < DEBUG < ERROR < FATAL < anything else
	 *
	 * If the 2nd paramater is the only other parameter and it is a 
	 * function, then it is evaluated and the result is expected to be
	 * an array, which contains the elements to be logged.
	 *
	 */
	level = level.toUpperCase();
	var numeric_level = get_numeric_log_level(level);

	if (numeric_level > 0 && numeric_level <= _log_level) {
		var args = arguments_to_array(arguments).slice(1);
		if (args.length == 1 && typeof args[0] == "function") {
			// Lazy evaluation.
			args = args[0]();
		}

		args.unshift(level, new Date());

		console.log.apply(console, args);
	}
}



exports.copy               = copy;
exports.extend             = extend;
exports.repeat             = repeat;
exports.alternator         = alternator;
exports.arguments_to_array = arguments_to_array;
exports.map                = map;
exports.sprintf            = sprintf;
exports.hitch              = hitch;
exports.not                = not;
exports.get_keys           = get_keys;
exports.rev_hash           = rev_hash
exports.xml_parse          = _xml_parse();
exports.isFalsy            = isFalsy;
exports.isTruthy           = isTruthy;
exports.set_log_level      = set_log_level;
exports.log_it             = log_it;
exports.once               = once;

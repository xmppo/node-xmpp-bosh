#!/usr/bin/env node
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

var fs    = require('fs');
var path  = require('path');
var cp    = require('child_process');
var dutil = require('./src/dutil.js');

function get_files(dir) {
	return fs.readdirSync(dir).map(function(fn) {
		return path.join(dir, fn);
	});
}

var pwd_files   = get_files('.');
var src_files   = get_files('src');
var tests_files = get_files('tests');


var files = [].concat(pwd_files, src_files, tests_files);
files = files.filter(function(fn) {
	return fn.search(/.js$/) !== -1;
});

var mtimes = { };

files.forEach(function(fp) {
	console.log("Watching file:", fp);
	mtimes[fp] = 0;

	fs.watchFile(fp, function(curr, prev) {
		// console.log(curr.mtime.getTime(), prev.mtime.getTime());
		var cmtime = curr.mtime.getTime(), pmtime = prev.mtime.getTime();
		if (curr.mtime == prev.mtime || mtimes[fp] == cmtime) {
			return;
		}
		mtimes[fp] = cmtime;

		var jslint = cp.spawn('jslint', [ '--forin=false', '--node=false', '--nomen=true', '--vars=true', fp ]);
		var title = "Linting file: " + fp;
		var underline = dutil.repeat('-', title.length).join('');

		console.log("\n" + title);
		console.log(underline);
		jslint.stdout.on('data', function(d) {
			console.log(d.toString());
		});
	});
});

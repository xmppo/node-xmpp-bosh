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
var tests_files = get_files('src');


var files = [].concat(pwd_files, src_files, tests_files);
files = files.filter(function(fn) {
	return fn.search(/.js$/) != -1;
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

		var jslint = cp.spawn('jslint', [ fp ]);
		var title = "Linting file: " + fp;
		var underline = dutil.repeat('-', title.length).join('');

		console.log("\n" + title);
		console.log(underline);
		jslint.stdout.on('data', function(d) {
			console.log(d.toString());
		});
	});
});

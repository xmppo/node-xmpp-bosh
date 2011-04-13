#!node


function show_version() {
	var fs = require('fs');
	var pkg_str = fs.readFileSync("./package.json");
	var pkg_info = JSON.parse(pkg_str);
	console.log(pkg_info.name + ": BOSH server version " + pkg_info.version);
}

function main() {
	var opts = require('tav').set({
		logging: {
			note: "The logging level to use (default: DEBUG)", 
			value: "DEBUG"
		}, 
		path: {
			note: "The HTTP PATH at which to run the BOSH server (default: /http-bind/)", 
			value: "/http-bind/"
		}, 
		port: {
			note: "The port on which to run the BOSH server (default: 5280)", 
			value: 5280
		}, 
		version: {
			note: "Display version info and exit", 
			value: false
		}
	}, "Usage: bosh_server [option=value]");

	var server_options = { };

	if (opts.version) {
		show_version();
		return;
	}
	
	if (opts.port) {
		var _port = parseInt(opts.port);
		if (!_port) {
			_port = 5280;
		}
		server_options.port = _port;
	}

	if (opts.path) {
		if (opts.path.length > 0 && opts.path[0] != "/") {
			opts.path = "/" + opts.path;
		}
		server_options.path = opts.path;
	}

	if (opts.logging) {
		server_options.logging = opts.logging.toUpperCase();
	}



	var nxb    = require("./src/main.js");

	var msg = "Starting the BOSH server on port '" + server_options.port + "' at '" + new Date() + "'";
	var hr  = "+-" + nxb.dutil.repeat('-', msg.length).join('') + "-+";
	console.log(hr);
	console.log("| " + msg + " |");
	console.log(hr);

	var server = nxb.start(server_options);

}

// Go!!
main();

// server.stop();

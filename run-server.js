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
var nxb   = require("./src/main.js");
var dutil = require('./src/dutil.js');

var BOSH_DEFAULT_CONFIG_PATH = '/etc/bosh.js.conf';


function app_meta() {
	var fs = require('fs');
	var package_json_path = require.resolve("./package.json");

	var pkg_str = fs.readFileSync(package_json_path);
	var meta = JSON.parse(pkg_str);
	return meta;
}


function get_version() {
	return app_meta().version;
}

function show_version() {
	var meta = app_meta();
	console.log(meta.name + ": BOSH server version " + meta.version);
}

function print_boxed_message(msg) {
	var hr  = "+-" + nxb.dutil.repeat('-', msg.length).join('') + "-+";
	console.log(hr);
	console.log("| " + msg + " |");
	console.log(hr);
}

function main() {
	var opts = require('tav').set({
		logging: {
			note: "The logging level to use (default: INFO)", 
			value: -1
		}, 
		path: {
			note: "The HTTP PATH at which to run the BOSH server (default: /http-bind/)", 
			value: -1
		}, 
		port: {
			note: "The port on which to run the BOSH server (default: 5280)", 
			value: -1
		}, 
		host: {
			note: "The host on which to the BOSH server should listen for connections (default: 0.0.0.0)", 
			value: -1
		}, 
		version: {
			note: "Display version info and exit", 
			value: false
		}, 
		config: {
			note: "The config file to load (default: /etc/bosh.js.conf). If a relative path " +
				"specified, then it is assumed to be relative not to your Current Working Directory " +
				"but to the install directory for node-xmpp-bosh. *NOTE*: Command " + 
				"line options (if specified) will override options in the config file", 
			value: BOSH_DEFAULT_CONFIG_PATH
		}
	}, "Usage: bosh_server [option=value]");

	if (opts.version) {
		show_version();
		return;
	}

	var server_options = { };

	if (opts.config) {
		if (opts.config[0] !== '/') {
			opts.config = "./" + opts.config;
		}

		try {
			var _cfg = require(opts.config);
			server_options = _cfg.config;
		}
		catch(ex) {
			if (opts.config !== BOSH_DEFAULT_CONFIG_PATH) {
				console.error("Caught Exception: '" + ex.toString() + "' while trying to read " + 
					"config file '" + opts.config + "'");
				process.exit(2);
			}
		}
	}

	if (opts.port === -1) {
		if (!server_options.port) {
			server_options.port = 5280;
		}
	}
	else {
		var _port = Math.ceil(opts.port);
		if (!_port) {
			_port = 5280;
		}
		server_options.port = _port;
	}

	if (opts.host === -1) {
		if (!server_options.host) {
			server_options.host = '0.0.0.0';
		}
	}
	else {
		server_options.host = opts.host;
	}

	if (opts.path === -1) {
		if (!server_options.path) {
			server_options.path = '/http-bind/';
		}
	}
	else {
		if (opts.path.length > 0 && opts.path[0] !== "/") {
			opts.path = "/" + opts.path;
		}
		server_options.path = opts.path;
	}

	if (opts.logging === -1) {
		if (!server_options.logging) {
			server_options.logging = 'INFO';
		}
	}
	else {
		server_options.logging = opts.logging.toUpperCase();
	}

    // Set the default line trim length.
    if (typeof(server_options.trim_default_length) !== 'undefined') {
        dutil.TRIM_DEFAULT_LENGTH = server_options.trim_default_length;
    }

	print_boxed_message(nxb.dutil.sprintf("Starting BOSH server 'v%s' on 'http://%s:%s%s' at '%s'", 
										  get_version(), server_options.host, server_options.port, 
										  server_options.path, new Date())
					   );

	var bosh_server = nxb.start_bosh(server_options);

	print_boxed_message(nxb.dutil.sprintf("Starting WEBSOCKET server 'v%s' on ws://%s:%s' at '%s'", 
										  get_version(), 
                                          server_options.host, 
                                          server_options.port, 
										  new Date())
					   );

	var ws_server   = nxb.start_websocket(bosh_server);
}

// Go!!
main();

// bosh_server.stop();

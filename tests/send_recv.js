// var BOSH_SERVICE = 'http://bosh.metajack.im:5280/xmpp-httpbind'
var BOSH_HOST = 'http://localhost:5280';
var BOSH_ENDPOINT = '/http-bind/';
var BOSH_SERVICE = '';

var XMPP_USERS = null;

/* The file passed in as --users should have the follow format:
exports.users = [
	{ jid: "JID01", password: "PASSWORD01", route: "xmpp:domain:port" }, 
	{ jid: "JID02", password: "PASSWORD02" }
];
*/


var strophe = require("../strophe/strophe.js").Strophe;
var dutil   = require("../src/dutil.js");
var us      = require("underscore");

var Strophe = strophe.Strophe;
var $iq     = strophe.$iq;
var $msg    = strophe.$msg;
var $build  = strophe.$build;
var $pres   = strophe.$pres;

var out_queue = [ ];

var SEND_EVERY_MSEC = 1000;
var PACKETS_TO_SEND = 7;


setInterval(function() {
	var victims = out_queue.splice(0, PACKETS_TO_SEND);
	console.log("victims.length:", victims.length);

	victims.forEach(function(v) {
		v.conn.send(v.msg);
	});
}, SEND_EVERY_MSEC);


function disconnect(conn) {
    conn.disconnect();
}


function connect(username, password, route, onStanza, onConnect) {
    var conn = new Strophe.Connection(BOSH_SERVICE);
	conn.connect(username, password, onConnect, null, null, route);
	conn.xmlInput = onStanza;
	return conn;
}

function start_test() {

	XMPP_USERS.forEach(function(user_info) {
		var jid      = user_info.jid;
		var password = user_info.password;
		var route    = user_info.route;

		function onStanza(stanza) {
			console.log("Received:", stanza.nodeName);
			var s = stanza._childNodes[0];
			if (stanza._childNodes.length > 0 && s.nodeName == "MESSAGE" && s._childNodes.length > 0) {
				console.log("Got:", s._childNodes[0].innerHTML);
			}
		}

		function onConnect(status) {
			console.log("onConnect:", status, dutil.rev_hash(Strophe.Status)[status]);

			if (status == Strophe.Status.CONNFAIL) {
				console.log("CONNFAIL for:", jid);
				process.exit(1);
			}
			else if (status == Strophe.Status.ERROR) {
				console.log("ERROR for:", jid);
				process.exit(1);
			}
			else if (status == Strophe.Status.AUTHFAIL) {
				console.log("AUTHFAIL for:", jid);
				process.exit(1);
			}
			else if (status == Strophe.Status.CONNECTED) {
				// Send packets to all other users.
				dutil.repeat(0, 10).forEach(function(v, j) {
					us(XMPP_USERS).chain()
					.filter(function(x) { return true; /*x.jid != jid;*/ })	
					.each(function(uinfo2, i) {
						setTimeout(function() {
							var msg = $msg({
								type: "chat", 
								to: uinfo2.jid
							})
							.c("body")
							.t("A message " + j + " to be sent from: " + jid);

							out_queue.push({
								conn: conn, 
								msg: msg
							});
						}, j * 700);
					});
				});
			}
		}

		var conn = connect(jid, password, route, onStanza, onConnect);
	});
}


function main() {
	var opts = require('tav').set();

	if (opts.host) {
		BOSH_HOST = opts.host;
	}

	if (opts.endpoint) {
		BOSH_ENDPOINT = opts.endpoint;
	}

	if (opts.users) {
		XMPP_USERS = require("./" + opts.users).users;
	}

	if (!XMPP_USERS) {
		// The user probably forgot to pass params.
		console.log("Usage: node send_recv.js --users='users_config.js' " +
			"--host='http://localhost:5280' --endpoint='/http-bind/'");
		process.exit(2);
	}

	BOSH_SERVICE = BOSH_HOST + BOSH_ENDPOINT;

	start_test();
}

// GO!!
main();

// var BOSH_SERVICE = 'http://bosh.metajack.im:5280/xmpp-httpbind'
var BOSH_HOST = 'http://localhost:5280';
var BOSH_ENDPOINT = '/http-bind/';
var BOSH_SERVICE = BOSH_HOST + BOSH_ENDPOINT;

var XMPP_USERS = null;

/* The file passed in as --users should have the follow format:
exports.users = [
	{ jid: "JID01", password: "PASSWORD01" }, 
	{ jid: "JID02", password: "PASSWORD02" }
];
*/


var strophe = require("../strophe/strophe.js").Strophe;
var dutil   = require("../src/dutil.js");
var us      = require("../src/underscore.js");

var Strophe = strophe.Strophe;
var $iq     = strophe.$iq;
var $msg    = strophe.$msg;
var $build  = strophe.$build;
var $pres   = strophe.$pres;


function disconnect(conn) {
    conn.disconnect();
}


function connect(username, password, onStanza, onConnect) {
    var conn = new Strophe.Connection(BOSH_SERVICE);
	conn.connect(username, password, onConnect);
	conn.xmlInput = onStanza;
	return conn;
}

function start_test() {

	XMPP_USERS.forEach(function(user_info) {
		var jid      = user_info.jid;
		var password = user_info.password;

		function onStanza(stanza) {
			console.log("Received:", stanza.nodeName);
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
				us(XMPP_USERS).chain()
					.filter(function(x) { return x.jid != jid; })
					.each(function(uinfo2) {
						conn.send($msg({
							type: "chat", 
							to: uinfo2.jid
						})
						.c("body")
						.t("A message to be sent"));
				});
			}
		}

		var conn = connect(jid, password, onStanza, onConnect);
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

	start_test();
}

// GO!!
main();

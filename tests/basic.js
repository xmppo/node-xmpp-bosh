// var BOSH_SERVICE = 'http://bosh.metajack.im:5280/xmpp-httpbind'
var BOSH_HOST = 'http://localhost:5280';
var BOSH_ENDPOINT = '/http-bind/';
var BOSH_SERVICE = '';
var XMPP_USERNAME = "user@example.com";
var XMPP_PASSWORD = "password";
var XMPP_ROUTE = '';

var conn = null;

var strophe = require("../strophe/strophe.js").Strophe;
var dutil   = require("../src/dutil.js");

var Strophe = strophe.Strophe;
var $iq     = strophe.$iq;
var $msg    = strophe.$msg;
var $build  = strophe.$build;
var $pres   = strophe.$pres;


function disconnect() {
    conn.disconnect();
}


function connect() {
    conn = new Strophe.Connection(BOSH_SERVICE);
    conn.rawInput = rawInput;
    conn.rawOutput = rawOutput;
	conn.connect(XMPP_USERNAME, XMPP_PASSWORD, onConnect, null, null, XMPP_ROUTE);
}

function onConnect(status)
{
	console.log("onConnect:", status, dutil.rev_hash(Strophe.Status)[status]);

    if (status == Strophe.Status.CONNECTING) {
		log('Strophe is connecting.');
    } else if (status == Strophe.Status.CONNFAIL) {
		log('Strophe failed to connect.');
		process.exit(1);
    } else if (status == Strophe.Status.DISCONNECTING) {
		log('Strophe is disconnecting.');
    } else if (status == Strophe.Status.DISCONNECTED) {
		log('Strophe is disconnected.');
		process.exit(0);
	} else if (status == Strophe.Status.CONNECTED) {
		log('Strophe is connected.');
		disconnect();
    }
}

function main() {
	var opts = require('tav').set();

	if (opts.username) {
		XMPP_USERNAME = opts.username
	}

	if (opts.password) {
		XMPP_PASSWORD = opts.password;
	}

	if (opts.host) {
		BOSH_HOST = opts.host;
	}

	if (opts.endpoint) {
		BOSH_ENDPOINT = opts.endpoint;
	}

	if (opts.route) {
		XMPP_ROUTE = opts.route;
	}

	if (XMPP_USERNAME == "user@example.com") {
		// The user probably forgot to pass params.
		console.log("Usage: node basic.js --username='user@example.com' " +
			"--password='password' --host='http://localhost:5280' " + 
			"--endpoint='/http-bind/' --route='xmpp:domain:port'");
		process.exit(2);
	}

	BOSH_SERVICE = BOSH_HOST + BOSH_ENDPOINT;

	connect();
}

function log(msg) 
{
	console.log(msg);
}

function rawInput(data)
{
	console.log("\nReceived:", data);
}

function rawOutput(data)
{
   	console.log("\nSent:", data);
}

// GO!!
main();

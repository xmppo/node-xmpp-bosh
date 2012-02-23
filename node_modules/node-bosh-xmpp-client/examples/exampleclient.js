var xmpp = require("../lib/boshclient.js");

//change this data accordingly
var myjid = "me@example.com";
var mypassword = "keepitsecret";
var friend = "she@example.com";
var bosh = "http://localhost:5280/http-bind";

var me = new xmpp.Client(myjid + "/office", mypassword, bosh);

me.on('error', function(exception) {
	console.log("Error: " + exception);
	process.exit();
});

me.on('offline', function(reason) {
	console.log("now offline because of " + reason);
	process.exit();
});

me.on('online', function() {
	console.log("It feals great to be Online!!!!");
	me.sendMessage(myjid, 'i am also expecting to recieve the message');
	
	//main starts here
	main();
});

me.on('stanza', function(ltxe) {
	console.log("yeh i recieved something!!!")
	console.log(ltxe.toString());
	return;
});

var main = function() {
	
	//send initial presence packet
	me.send(xmpp.$pres());
	
	//send a message to your friend 10 seconds and disconnect 5 seconds after that	
	setTimeout(function() {
		me.sendMessage(friend,'hi, this is maddy!!!');
		setTimeout(function() {
			me.disconnect();
		},5 * 1000);
	},10 * 1000);
}

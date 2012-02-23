var http = require("http");
var net  = require("net");

exports.jid_parse = function(jid) {
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
		resource: parts[4],
		toString: function(){
					return this.username+"@"+this.domain+"/"+this.resource;
				}
	};
}

exports.decode64 = function(encoded)
{
	return (new Buffer(encoded, 'base64')).toString('utf8');
}

exports.encode64 = function(decoded)
{
	return (new Buffer(decoded, 'utf8')).toString('base64');
}

exports.randomstring = function()
{
	var l = 5 + Math.floor(Math.random() * 5);
	var chars = "0123456789qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM";
	var str = "";
	for(var i = 0;i < l;i++)
	{
		var n = Math.floor(Math.random() * chars.length);
		str += chars.substr(n, 1);
	}
	return str;
}

exports.xmlHttpRequest = function(options, cb, body)
{
	var hr = http.request(options, function(response) {
		var xdata = "";
		response.on('data', function(chunk){
			xdata += chunk.toString();
		});
		response.on('end', function(){
			logIt("DEBUG", "response: " + xdata);
			cb(false, xdata);
		});
		response.on('error', function(ee){
			cb(true, ee.toString());
		});
	});
	hr.setHeader("Connection", "Keep-Alive");
	hr.on('error', function(ee){
		cb(true, ee.toString());
	});
	logIt("DEBUG", "request: "+body);
	if(body)
	{
		hr.setHeader("Content-Type", "text/xml; charset=utf-8");
		hr.setHeader("Content-Length", body.length.toString());
		hr.write(body);
	}
	hr.end();
}

var logLevel = "FATAL";

exports.setLogLevel = function(ss)
{
	ss = ss.toUpperCase();
	if(!logLevels[ss])
		ss = "FATAL";
	logLevel = ss;
}

var logLevels = {
	FATAL	: 0,
	ERROR	: 1,
	INFO		: 2,
	DEBUG	: 3,
};

function logIt(type, quote)
{
	//handle logging levels
	if(logLevels[type])
	{
		if(logLevels[type] <= logLevels[logLevel])
			console.log(type + ": " + quote);
	}
}

exports.logIt = logIt;

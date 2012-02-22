var XmppParser = require("../src/stream-parser.js");
var _ = require("underscore");
var stream_start_attr = {
    from: "satyamshekhar@gmail.com"
    , to: "gmail.com"
    , version: "1.0"
    , "xml:lang": "en"
    , xmlns: "jabber:client"
    , "xmlns:stream": "http://etherx.jabber.org/stream"
};

var make_xml_str = function (name, attr) {
    var xml_str = "<" + name;
    _(attr).each(function (v, k) {
        xml_str += " " + k + "='" + v + "'";
    });
    xml_str += ">";
    return xml_str;
};

var stream_start = "<?xml version='1.0'?>";
stream_start += make_xml_str("stream:stream", stream_start_attr);
var parser = new XmppParser.XmppStreamParser();
parser.parse(stream_start);
var ss = '<message from="11@directi.com/1kC32B" sid="6b8ba23d-3e41-4144-937b-78d794d8f8bd" stimestamp="2012-02-22T12:07:27.462Z" to="9@directi.com" type="chat" xml:lang="en"> <body>message from 11@directi.com to 9@directi.com</body> </message>';

var bb = new Buffer(ss);

parser.on("error", function (e) {
    console.log("ParseError: %s", e);
});
var counter = 0;
parser.on("stanza", function (stanza) {
    // console.log("parsed(%s): %s", counter++, stanza.name);
});

var loop = 0;
var parse = function () {
    process.nextTick(function () {
        parser.parse(ss);
        parse();
    });
};


parse();
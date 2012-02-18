var XmppParser = require("../src/stream-parser.js");

var _ = require("underscore");
var assertTrue = require("assert").ok;
var ltx = require("ltx");
var util = require("util");

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

var test_1 = (function () {
    var parser = new XmppParser.XmppStreamParser();
    parser.once("stream-start", function (attrs) {
        var pass = true;
        _(stream_start_attr).each (function (v, k) {
            pass = pass && attrs[k] == v;
        });
        assertTrue(pass, "Test 1 - streamstart");
        console.log("Test 1 passed");
    });

    var stream_start = "<?xml version='1.0'?>";
    stream_start += make_xml_str("stream:stream", stream_start_attr);
    console.log ("Starting test 1 - parse: %s", stream_start);

    parser.parse(stream_start);
});

var test_2 = (function () {
    var parser = new XmppParser.XmppStreamParser();
    parser.on("error", function (err) {
        if (err === "stanza w/o stream-start") {
            console.log ("Test 2 Passed");
        } else {
            throw err;
        }
    });
    parser.parse ("<ping></ping>");
});

var test_3 = (function () {
    var stanzas = [];
    var parser = new XmppParser.XmppStreamParser();
    var stream_start = "<?xml version='1.0'?>";
    stream_start += make_xml_str("stream:stream", stream_start_attr);

    parser.on("error", function (err) {
        console.log ("Test 3 Passed: %s", err);
    });

    parser.parse(stream_start);
    parser.parse("<a> <b>");
    parser.parse("</a></b>");
});

var test_4 = (function () {
    var stanzas = [];

    for (var i = 0; i < 4; i++) {
        var message = new ltx.Element("message", {
            xmlns: "namespace",
            type: "message" + i
        });
        var body = new ltx.Element("body", {
            xmlns: "bodyns",
            type: "content"
        });
        body.t("messagebody" + i);
        message.cnode(body);
        stanzas.push(message);
    }

    console.log("stanzas: %s", util.inspect(stanzas));

    var parser = new XmppParser.XmppStreamParser();
    var stream_start = "<?xml version='1.0'?>";
    stream_start += make_xml_str("stream:stream", stream_start_attr);

    var stanzas_copy = stanzas.slice();
    parser.on("stanza", function (parsed_stanza) {
        var stanza = stanzas.shift();
        if (stanza.toString() !== parsed_stanza.toString()) {
            console.log("stanza: %s, parsed: %s", stanza, parsed_stanza);
        }
        assertTrue(stanza.toString() === parsed_stanza.toString(), "Test 4 Failed");
        if (stanzas.length === 0) {
            console.log("Test 4 passed");
        }
    });

    parser.parse(stream_start);

    stanzas_copy.forEach(function (stanza) {
        console.log ("will parse: %s", stanza);
        parser.parse(stanza.toString());
    });
});

var test_5 = (function () {
    var parser = new XmppParser.XmppStreamParser();
    var stream_start = "<?xml version='1.0'?>";
    stream_start += make_xml_str("stream:stream", stream_start_attr);
    parser.parse(stream_start);

    parser.on("error", function (err) {
        console.log("recv err: %s", err);
    });

    parser.parse("<ddb></ddb><r/></stream:stream><r>");
})();

var test_6 = (function () {
    var parser = new XmppParser.XmppStreamParser();

    parser.on("stanza", function (stanza) {
        // console.log("revd: %s", stanza);
    });

    parser.on("error", function (err){
        console.log("Test case 6 failed: %s", err);
    });

    var stream_start = "<?xml version='1.0'?><stream:stream xmlns='jabber:client' xmlns:stream='http://etherx.jabber.org/streams' id='3344545251' from='abc.com' version='1.0' xml:lang='en'><stream:features><starttls xmlns='urn:ietf:params:xml:ns:xmpp-tls'/><mechanisms xmlns='urn:ietf:params:xml:ns:xmpp-sasl'><mechanism>SCRAM-SHA-1</mechanism><mechanism>DIGEST-MD5</mechanism><mechanism>PLAIN</mechanism></mechanisms></stream:features>";
    parser.parse(stream_start);

    var next = "<proceed xmlns='urn:ietf:params:xml:ns:xmpp-tls'/>";
    parser.parse(next);
    parser.restart();

    var restart = "<?xml version='1.0'?><stream:stream xmlns='jabber:client' xmlns:stream='http://etherx.jabber.org/streams' id='2692183849' from='abc.com' version='1.0' xml:lang='en'><stream:features><mechanisms xmlns='urn:ietf:params:xml:ns:xmpp-sasl'><mechanism>SCRAM-SHA-1</mechanism><mechanism>DIGEST-MD5</mechanism><mechanism>PLAIN</mechanism></mechanisms></stream:features>";
    parser.parse(restart);

})();

// test_5();

var nbc = require("node-bosh-xmpp-client");

var opts = require("tav").set({
    nclient: {
        value: 1
    },
    route: {
        value: "xmpp:172.16.142.134:5222"
    },
    bosh: {
        value: "http://localhost:10280/http-bind/"
    },
    messageInterval: {
        value: 0
    },
    disconnectAfterLogin: {
        value: false
    },
    nbcLogLevel: {
        value: "DEBUG"
    }
});

console.log("nclients: %s, route: %s, bosh: %s, messageInterval: %s", opts.nclient, opts.route, opts.bosh, opts.messageInterval);
var count = 0;
for (var i = 1; i <= opts.nclient ; i++) {
    var j =  i + "@directi.com";
    // var client = new nbc.Client (j, "qwedsa", "http://10.10.1.50/bosh/http-bind/");
    var client = new nbc.Client (j, "qwedsa", opts.bosh, opts.route);
    // var client = new nbc.Client ("satyam.s@directi.com", "shekhar123", "http://localhost:10280/http-bind/", "xmpp:172.16.142.134:5222");
    nbc.setLogLevel(opts.nbcLogLevel);
    client.on("online", (function () {
        var jid = j;
        var ind = i;
        var cl = client;
        ++count;
        console.log("%s online", j);
        return function () {
            // console.log("jid: %s online", jid);
            cl.send(nbc.$pres());

            if (opts.messageInterval > 0) {
                var interval = setInterval(function () {
                    for (var k = 1; k < opts.nclient; k++) {
                        if (k !== ind)
                            cl.sendMessage(k + "@directi.com", "message from " + jid + " to " + k + "@directi.com");
                    }
                }, opts.messageInterval * 1000);
            }
            // client.disconnect();
        };
    })());

    client.on("stanza", function (stanza) {
        // console.log("recv: %s", stanza.toString());
    });

    client.on("offline", (function () {
        var jid = j;
        --count;
        return function (reason) {
            console.log("count: %s, jid: %s offline: %s", count, jid, reason);
        };
    })());
    client.on("error", (function () {
        var jid = j;
        return function (err) {
            console.log("error: %s = %s", jid, err);
        };
    })());
}

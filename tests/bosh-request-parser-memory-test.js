var BoshParser = require("../src/bosh-request-parser.js").BoshRequestParser;
var _ = require("underscore");

var parse = function () {
    process.nextTick(function () {
        var p = new BoshParser();
        p.parse('<body sid="781b650b-14d3-4ef2-bc8e-7b8396c373a6" rid="4410" xmlns="http://jabber.org/protocol/httpbind" stream="7edd563f-4615-4bb8-88b7-5ddd36700883"><message from="11@directi.com/1kC32B" sid="6b8ba23d-3e41-4144-937b-78d794d8f8bd" stimestamp="2012-02-22T12:07:27.462Z" to="9@directi.com" type="chat" xml:lang="en"><body>message from 11@directi.com to 9@directi.com</body></message><message from="185@directi.com/TAIju5" sid="9ac47bac-a03d-4ab8-869c-2ab0e6d74ab3" stimestamp="2012-02-22T12:07:27.464Z" to="9@directi.com" type="chat" xml:lang="en"><body>message from 185@directi.com to 9@directi.com</body></message></body>');
        if(!p.parsedBody) throw "ERROR";
        parse();
    });
};

parse();
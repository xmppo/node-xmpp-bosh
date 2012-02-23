var ltx = require("ltx");
var tcp = require("net");

var writer = new tcp.Socket();

var reader = new tcp.Server();
reader.listen(7878);
reader.on ("connection", function(s) {
    s.on("data", function (d) {
        console.log(d.toString());
    });
});

var f = function () {
    process.nextTick(function () {
        var e = ltx.parse('<body><message to="145@directi.com" from="204@directi.com/undefined" type="chat" xml:lang="en"><body>message from 204@directi.com to 145@directi.com</body></message><message to="146@directi.com" from="204@directi.com/undefined" type="chat" xml:lang="en"><body>message from 204@directi.com to 146@directi.com</body></message><message to="147@directi.com" from="204@directi.com/undefined" type="chat" xml:lang="en"><body>message from 204@directi.com to 147@directi.com</body></message><message to="148@directi.com" from="204@directi.com/undefined" type="chat" xml:lang="en"><body>message from 204@directi.com to 148@directi.com</body></message><message to="149@directi.com" from="204@directi.com/undefined" type="chat" xml:lang="en"><body>message from 204@directi.com to 149@directi.com</body></message><message to="150@directi.com" from="204@directi.com/undefined" type="chat" xml:lang="en"><body>message from 204@directi.com to 150@directi.com</body></message><message to="151@directi.com" from="204@directi.com/undefined" type="chat" xml:lang="en"><body>message from 204@directi.com to 151@directi.com</body></message><message to="152@directi.com" from="204@directi.com/undefined" type="chat" xml:lang="en"><body>message from 204@directi.com to 152@directi.com</body></message></body>');
        
        if (!e) throw "parse error";
        console.log("parsed: %s", e.name);
        e.toString();
        f();
    });
};

f();
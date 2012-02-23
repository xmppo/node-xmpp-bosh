var uuid = require('node-uuid');

var h = { };

console.log(uuid());

var a = [ ];
var b = [ ];

for (var i = 0; i >= 0; ++i) {
    var k = uuid();

    h[k] = { value: k };
    h[k]["self"] = h[k];

    a.push(k);
    if (i > 0 && (i % 1000000) == 0) {
        console.log("i:", i);
        a.reverse();
        b = a;
        a = [ ];
    }
    
    if (i > 1000000 && b.length > 0) {

        // var k1 = "abcdefghijklmnopqrstuvwxyz" + String(i-1000000);
        var k1 = b.pop();
        delete h[k1];

    }
}

console.log("foo");
setInterval(function() { }, 1000);

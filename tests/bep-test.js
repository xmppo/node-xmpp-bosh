var e = require('eventpipe').EventPipe;
var ei = new e();

ei.on("one", function () {
    var obj = { "saytam": "shekahr"};
    process.nextTick(function () {
        console.log("one");
        obj.shekhar= "satyam";
        ei.emit("two");
    });
});

ei.on("two", function () {
    var obj = { "saytam": "shekahr"};
    process.nextTick(function () {
        obj.copy = "write";
        console.log("two");
        ei.emit("one");
    });
});

ei.emit("one");
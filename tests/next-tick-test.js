require("v8-profiler");

function X () {
    this.next_tick = false;
    this.queue = [];
};

X.prototype.work = function () {
    var x = this.queue.pop();
    while (x) {
        // console.log(x.toString());
        var y = x.toString();
        y += "1";
        x = this.queue.pop();
    }
};

X.prototype.try_working = function (x) {
    this.queue.push(x);
    if (!this.next_tick) {
        var self = this;
        process.nextTick(function () {
            self.next_tick = false;
            self.work();
        });
        this.next_tick = true;
    }
};

var ltx = require('ltx');
var work = [];
var worker = [];
var str = '<wrap><message to="143@directi.com" from="120@directi.com/undefined" type="chat" xml:lang="en"><body>message from 120@directi.com to 143@directi.com</body></message><message to="144@directi.com" from="120@directi.com/undefined" type="chat" xml:lang="en"><body>message from 120@directi.com to 144@directi.com</body></message><message to="145@directi.com" from="120@directi.com/undefined" type="chat" xml:lang="en"><body>message from 120@directi.com to 145@directi.com</body></message><message to="146@directi.com" from="120@directi.com/undefined" type="chat" xml:lang="en"><body>message from 120@directi.com to 146@directi.com</body></message></wrap>';

for (var i = 0; i < 1000; i++) {
    work.push(ltx.parse(str));
    worker.push(new X());
}

var counter = 0;
var interval = setInterval(function () {
    ++counter;
    console.log("counter: %s", counter);
    if (counter >= 5) {
        worker = [ ];
        work = [ ];
        clearInterval(interval);
        return;
    }
    for (i = 0; i < 1000; i++) {
        for (var j = 0; j < 1000; j++) {
            worker[i].try_working(work[j]);
        }
    }
}, 5 * 1000);

setInterval(function () {
    console.log("keep-alive");
}, 10000);
var log4js = require("log4js");

// There is an issue with log4js release
// right now which has been fixed in their
// master, they replace plain old console.log
// with their logger. Turning off this conf
// crashes in their current release. We will
// turn it off as soon as they release.

log4js.configure({
    doNotReplaceConsole: true
});

var appender = log4js.consoleAppender(log4js.basicLayout);
log4js.clearAppenders();
log4js.addAppender(appender);
log4js.setGlobalLogLevel("INFO");

var set_log_level = function (level) {
	log4js.setGlobalLogLevel(level);
};

module.exports = log4js;
module.exports.set_log_level = set_log_level;

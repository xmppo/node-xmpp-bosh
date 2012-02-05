var log4js = require("log4js");

// There is an issue with log4js release
// right now which has been fixed in their
// master, they replace plain old console.log
// with their logger. Turning off this conf
// crashes in their current release. We will
// turn it off as soon as they release.

// log4js.configure({
//     doNotReplaceConsole: true
// });

var appender = log4js.consoleAppender(log4js.basicLayout);
log4js.clearAppenders();
log4js.addAppender(appender);
log4js.setGlobalLogLevel("INFO");

var set_log_level = function (level) {
	log4js.setGlobalLogLevel(level);
};

// we stop logging to console when
// logging to file right now.
var log_to_file = function (opts) {
	// we keep logging to console in case
	// no file name is provided.
	if (!opts.log_file_name) {
		return;
	}

	// max_log_file_size rolls up the log - it is
	// required to enable log rolling.
	var appender = log4js.fileAppender(opts.log_file_name, log4js.basicLayout, opts.max_log_file_size, opts.number_of_log_files);

    log4js.clearAppenders();
    log4js.addAppender(appender);
};

module.exports = log4js;
module.exports.set_log_level = set_log_level;
module.exports.log_to_file = log_to_file;

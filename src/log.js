var log4js = require("log4js");
/*
log4js.configure({
    doNotReplaceConsole: true
});
*/
var appender = log4js.consoleAppender(log4js.basicLayout);
log4js.clearAppenders();
log4js.addAppender(appender);
log4js.setGlobalLogLevel("INFO");

module.exports = log4js;

module.exports.setLogOptions = function (opts) {
    var appender = log4js.fileAppender(opts.log_file_name, undefined, opts.max_log_file_size, opts.number_of_log_files);

    log4js.clearAppenders()
    log4js.addAppender(appender);
    log4js.setGlobalLogLevel(opts.logging || "INFO");
};

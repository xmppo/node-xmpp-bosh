var log4js = require("log4js");

log4js.configure({
    appenders:[
        { type:"console" }
    ]
});

log4js.setGlobalLogLevel("INFO");

var set_log_level = function (level) {
	log4js.setGlobalLogLevel(level);
};

module.exports = log4js;
module.exports.set_log_level = set_log_level;

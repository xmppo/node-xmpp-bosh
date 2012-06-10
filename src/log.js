var logger = require("node-lumberjack");

function set_log_level(level) {
    logger.setGlobalLogLevel(level);
};

module.exports               = logger;
module.exports.set_log_level = set_log_level;

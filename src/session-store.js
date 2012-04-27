var path     = require('path');
var dutil    = require('./dutil.js');
var uuid     = require('node-uuid');
var helper   = require("./helper.js");
var Session  = require("./session.js").Session;
var filename = "[" + path.basename(path.normalize(__filename)) + "]";
var log      = require('./log.js').getLogger(filename);

var sessions = { };

var stats = {
    active  : 0,     // Stores the number of active sessions
    total   : 0      // Stores the total number of sessions
};

// bep will be injected to all the sessions created.
var bep = null, options = null;

// This holds the terminate condition for terminated
// sessions. Both this, and terminated_streams are used when the
// connection between nxb and xmpp server breaks and all the
// session related info is wiped out. We preserve the condition in
// this case to let the client know why its connection broke.
var terminated_sessions = { };

// Ideally, the session_* functions shouldn't worry about anything except for
// session state maintenance. They should specifically NOT know about streams.
// There may be some exceptions where the abstractions leak into one another,
// but they should be the exceptions (and there should be a good reason for
// such an occurence) and not the rule.

//Fetches a BOSH session object given a BOSH stanza (<body> tag)
function stat_session_add() {
    ++stats.active;
    ++stats.total;
}

function stat_session_terminate(stats) {
    --stats.active;
}

function get_session(sid) {
    return sessions[sid];
}

function terminate_session(session, condition) {
    helper.save_terminate_condition_for_wait_time(terminated_sessions,
                                                  session.sid, condition, session.wait);
    delete sessions[session.sid];
    stat_session_terminate();
}

function prepare_attributes(attrs) {
    attrs.inactivity  = attrs.inactivity || options.DEFAULT_INACTIVITY;
    attrs.content     = attrs.content || "text/xml; charset=utf-8";

    attrs.window_size = options.WINDOW_SIZE;
    attrs.ver         = options.ver || '1.6';
    attrs.pidgin_compatible = options.PIDGIN_COMPATIBLE;

    attrs.inactivity = [attrs.inactivity, options.MAX_INACTIVITY,
                        options.DEFAULT_INACTIVITY].sort(dutil.num_cmp)[1];
}

function add_session(attrs) {
    // TODO: Log the number of entries in terminated_sessions
    prepare_attributes(attrs);
    var session = new Session(uuid(), attrs, bep);
    sessions[session.sid] = session;
    stat_session_add();
    return session;
}

function get_terminate_condition(sid) {
    return terminated_sessions[sid].condition;
}

function send_invalid_session_terminate_response(res, node) {
    log.trace("Sending invalid sid");
    var terminate_condition;
    if (this._terminated_sessions[node.attrs.sid]) {
        terminate_condition = this._terminated_sessions[node.attrs.sid].condition;
    }
    var attrs = {
        condition   : terminate_condition || 'item-not-found',
        message     : terminate_condition ? '' : 'Invalid session ID'
    };
    var ro = new responsejs.Response(res, null, "invalid-sid", this._bosh_options);
    ro.send_termination_stanza(attrs);
}

function initialize(_bep, _options) {
    bep = _bep;
    options = _options;
}

module.exports.__defineGetter__("active_session_count", function () {
    return stats.active;
});

module.exports.__defineGetter__("total_session_count", function () {
    return stats.total;
});

module.exports.initialize  = initialize;
module.exports.get_session = get_session;
module.exports.add_session = add_session;
module.exports.terminate_session       = terminate_session;
module.exports.get_terminate_condition = get_terminate_condition;

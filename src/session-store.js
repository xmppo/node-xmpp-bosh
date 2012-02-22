function SessionStore(bosh_options, bep) {
    this._bosh_options = bosh_options;
    this._bep = bep;
    this._sid_state = {
    };

    this._sid_info = {
        length  : 0,     // Stores the number of active sessions
        total   : 0     // Stores the total number of sessions
    };

    // This holds the terminate condition for terminated
    // sessions. Both this, and terminated_streams are used when the
    // connection between nxb and xmpp server breaks and all the
    // session related info is wiped out. We preserve the condition in
    // this case to let the client know why its connection broke.
    this._terminated_sessions = {
    };

}

SessionStore.prototype = {

    get_active_no: function () {
        return this._sid_info.length;
    },

    get_total_no: function () {
        return this._sid_info.total;
    },

    //Fetches a BOSH session object given a BOSH stanza (<body> tag)
    get_session: function (node) {
        var sid = node.attrs.sid;
        var session = sid ? this._sid_state[sid] : null;
        return session;
    },

    get_sessions_obj: function () {
        return this._sid_state;
    },

    add_session: function (node, res) {
        var self = this;
        // TODO: Log the number of entries in this._terminated_sessions
        var session = new Session(node, this._bosh_options, this._bep,
            function (session, condition) {
                helper.save_terminate_condition_for_wait_time(self._terminated_sessions,
                    session.sid, condition, session.wait);
                delete self._sid_state[session.sid];
                self.stat_session_terminate();
            });
        session.reset_inactivity_timeout();
        session.add_held_http_connection(node.attrs.rid, res);
        this._sid_state[session.sid] = session;
        this.stat_session_add();
        return session;
    },

    send_invalid_session_terminate_response: function (res, node) {
        log.trace("Sending invalid sid");
        var terminate_condition;
        if (this._terminated_sessions[node.attrs.sid]) {
            terminate_condition = this._terminated_sessions[node.attrs.sid].condition;
        }
        var attrs = {
            condition   : terminate_condition || 'item-not-found',
            message     : terminate_condition ? '' : 'Invalid session ID'
        };
        var ro = new responsejs.Response(res, null, this._bosh_options);
        ro.send_termination_stanza(attrs);
    },

    stat_session_add: function () {
        ++this._sid_info.length;
        ++this._sid_info.total;
    },

    stat_session_terminate: function () {
        --this._sid_info.length;
    }

};

exports.SessionStore = SessionStore;

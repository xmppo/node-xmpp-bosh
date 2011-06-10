var dns = require('dns');

function compareNumbers(a, b) {
    a = parseInt(a, 10);
    b = parseInt(b, 10);
    return (a < b ? -1 : (a > b ? 1 : 0));
}

function groupSrvRecords(addrs) {
    var groups = {};  // by priority
    addrs.forEach(function(addr) {
        if (!groups.hasOwnProperty(addr.priority)) {
            groups[addr.priority] = [];
	}

        groups[addr.priority].push(addr);
    });

    var result = [];
    Object.keys(groups).sort(compareNumbers).forEach(function(priority) {
        var group = groups[priority];
        var totalWeight = 0;
        group.forEach(function(addr) {
            totalWeight += addr.weight;
        });
        var w = Math.floor(Math.random() * totalWeight);
        totalWeight = 0;
        var candidate = group[0];
        group.forEach(function(addr) {
            totalWeight += addr.weight;
            if (w < totalWeight) {
                candidate = addr;
	    }
        });
        if (candidate) {
            result.push(candidate);
	}
    });
    return result;
}

function resolveSrv(name, cb) {
    dns.resolveSrv(name, function(err, addrs) {
        if (err) {
            /* no SRV record, try domain as A */
            cb(err);
        } else {
            var pending = 0, error, results = [];
            var cb1 = function(e, addrs1) {
                error = error || e;
                results = results.concat(addrs1);
                pending--;
                if (pending < 1) {
                    cb(results ? null : error, results);
                }
            };
	    var gSRV = groupSrvRecords(addrs);
	    pending = gSRV.length;
	    gSRV.forEach(function(addr) {
                resolveHost(addr.name, function(e, a) {
                    if (a) {
                        a = a.map(function(a1) {
                            return {
				name: a1,
                                port: addr.port
			    };
                        });
		    }
                    cb1(e, a);
                });
            });
        }
    });
}

// one of both A & AAAA, in case of broken tunnels
function resolveHost(name, cb) {
    // console.error("resolveHost::", new Error().stack.toString());
    var error, results = [];
    var cb1 = function(e, addr) {
        error = error || e;
        if (addr) {
            results.push(addr);
	}

        cb((results.length > 0) ? null : error, results);
    };

    dns.lookup(name, cb1);
}

function addListeners(emitter, event, listeners) {
    var _l = emitter.listeners(event);
    listeners.unshift(0, 0);
    _l.splice.apply(_l, listeners);
}

function extractAllListeners(emitter, event) {
    var listeners = emitter.listeners(event);
    listeners = listeners.splice(0, listeners.length);
    return listeners;
}


// connection attempts to multiple addresses in a row
function tryConnect(socket, addrs) {
    // console.error("tryConnect::", new Error().stack.toString());

    // Save original listeners
    // TODO: Also unhook the 'close' event listeners
    var _c_listeners = extractAllListeners(socket, 'connect');
    var _e_listeners = extractAllListeners(socket, 'error');

    var onConnect = function() {
	// console.error('srv.js::connected!!');
        socket.removeListener('connect', onConnect);
        socket.removeListener('error', onError);

	addListeners(socket, 'connect', _c_listeners);
	addListeners(socket, 'error',   _e_listeners);

        // done!
        socket.emit('connect');
    };

    var error;
    var onError = function(e) {
	// console.error("srv.js::onError, e:", e, addrs);
        error = e;
        connectNext();
    };
    var connectNext = function() {
	// console.error("srv.js::addrs:", addrs);
        var addr = addrs.shift();
        if (addr) {
            socket.connect(addr.port, addr.name);
	}
        else {
	    // console.error("Emitting ERROR in srv.js");

            socket.removeListener('connect', onConnect);
            socket.removeListener('error', onError);

	    addListeners(socket, 'connect', _c_listeners);
	    addListeners(socket, 'error',   _e_listeners);

            socket.emit('error', error || new Error('No addresses to connect to'));
	}
    };

    // Add our listeners
    socket.addListener('connect', onConnect);
    socket.addListener('error', onError);
    connectNext();
}

// returns EventEmitter with 'connect' & 'error'
exports.connect = function(socket, services, domain, defaultPort) {

    var tryServices = function() {
        var service = services.shift();
        if (service) {
            resolveSrv(service + '.' + domain, function(error, addrs) {
                if (addrs) {
                    tryConnect(socket, addrs);
		}
                else {
                    tryServices();
		}
            });
        } else {
            resolveHost(domain, function(error, addrs) {
                if (addrs && addrs.length > 0) {
                    addrs = addrs.map(function(addr) {
                        return { name: addr,
                                 port: defaultPort };
                    });
                    tryConnect(socket, addrs);
                }
		else {
                    socket.emit('error', error || new Error('No addresses resolved for ' + domain));
		}
            });

        } // if (service)

    }; // tryServices()

    // We start the process in the next tick so that if anything happens
    // synchronously, then the event listeners that the user has added 
    // on the socket object after calling connect() are also handled
    // properly.
    process.nextTick(tryServices);
};

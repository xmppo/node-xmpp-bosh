// Target API:
//
//  var s = require('net').createStream(25, 'smtp.example.com');
//  s.on('connect', function() {
//   require('starttls')(s, options, function() {
//      if (!s.authorized) {
//        s.destroy();
//        return;
//      }
//
//      s.end("hello world\n");
//    });
//  });
//
//

var semver = require('semver');

module.exports = function starttls(socket, options, cb) {

  var sslcontext = require('crypto').createCredentials(options);

  var pair = require('tls').createSecurePair(sslcontext, false);

  var cleartext = pipe(pair, socket);

  pair.on('secure', function() {
      var verifyError;
      if (semver.lt(semver.clean(process.version), '0.4.8')) {
	  verifyError = pair._ssl.verifyError();
      }
      else {
	  verifyError = pair.ssl.verifyError();
      }

      if (verifyError) {
	  cleartext.authorized = false;
	  cleartext.authorizationError = verifyError;
      } else {
	  cleartext.authorized = true;
      }

      if (cb) cb();
  });

  cleartext._controlReleased = true;
  return cleartext;
};

var socket_id = 1;

function pipe(pair, socket) {
  pair.encrypted.pipe(socket);
  socket.pipe(pair.encrypted);

  pair.fd = socket.fd;
  var cleartext = pair.cleartext;
  cleartext.socket = socket;
  cleartext.encrypted = pair.encrypted;
  cleartext.authorized = false;

    var socket_id_local = socket_id++;

  function onerror(e) {
      console.log("starttls::onerror() ->", socket_id_local);
    if (cleartext._controlReleased) {
      cleartext.emit('error', e);
    }
  }

  function onclose() {
      console.log("starttls::onclose() ->", socket_id_local);
    // socket.removeListener('error', onerror);
    socket.removeListener('close', onclose);
  }

  socket.on('error', onerror);
  socket.on('close', onclose);

  return cleartext;
}

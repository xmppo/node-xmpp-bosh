
exports.re = /^\/http-bind\/$/;
exports.post_handler = function(response, cb) {
	cb(response.toString());
};

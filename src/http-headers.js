exports.GET = {
    'Content-Type': 'application/xhtml+xml; charset=UTF-8',
    'Cache-Control': 'no-cache, no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-requested-with, Set-Cookie',
    'Access-Control-Allow-Methods': 'OPTIONS, GET, POST',
    'Access-Control-Max-Age': '14400'
};

exports.POST = {
    'Content-Type': 'text/xml; charset=UTF-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-requested-with, Set-Cookie',
    'Access-Control-Allow-Methods': 'OPTIONS, GET, POST',
    'Access-Control-Max-Age': '14400'
};

exports.OPTIONS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-requested-with, Set-Cookie',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Max-Age': '14400'
};

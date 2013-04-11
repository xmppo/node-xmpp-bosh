#! /bin/bash

# XML Request: <body to="jabber.org" hold="1" rid="2241" wait="60" ver="1.6" xmlns:xmpp="urn:xmpp:xbosh" xmpp:version="1.0" />
LINE=`curl 'http://localhost:5280/http-bind/?data=%3Cbody%20to%3D%22jabber.org%22%20hold%3D%221%22%20rid%3D%222241%22%20wait%3D%2260%22%20ver%3D%221.6%22%20xmlns%3Axmpp%3D%22urn%3Axmpp%3Axbosh%22%20xmpp%3Aversion%3D%221.0%22%20/%3E'`

echo "[1] Got Response: $LINE"

NLINES=`echo "$LINE" | grep "stream" | grep "sid" | grep "hold" | grep "<body" | wc -l`

if [ $NLINES -ne 1 ]
then
    echo "## Invalid Response: $LINE"
    exit 1
fi


# XML Request: <body/>
LINE=`curl 'http://localhost:5280/http-bind/?data=%3Cbody/%3E'`

echo "[2] Got Response: $LINE"

NLINES=`echo "$LINE" | grep "item-not-found" | grep "terminate" | grep "<body" | wc -l`

if [ $NLINES -ne 1 ]
then
    echo "## Invalid Response: $LINE"
    exit 1
fi


# XML Request: <body to="jabber.org" hold="1" rid="2241" wait="60" ver="1.6" xmlns:xmpp="urn:xmpp:xbosh" xmpp:version="1.0" />
LINE=`curl 'http://localhost:5280/http-bind/?data=%3Cbody%20to%3D%22jabber.org%22%20hold%3D%221%22%20rid%3D%222241%22%20wait%3D%2260%22%20ver%3D%221.6%22%20xmlns%3Axmpp%3D%22urn%3Axmpp%3Axbosh%22%20xmpp%3Aversion%3D%221.0%22%20/%3E&callback=myCB'`

echo "[3] Got Response: $LINE"

NLINES=`echo "$LINE" | grep "stream" | grep 'sid=\\\"' | grep 'hold=\\\"' | grep "<body" | grep "myCB" | wc -l`

if [ $NLINES -ne 1 ]
then
    echo "## Invalid Response: $LINE"
    exit 1
fi

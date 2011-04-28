#!/bin/bash

VERSION=`cat package.json | grep "version" | cut -d ' ' -f 2 | sed s/\"//g`
DIR="node-xmpp-bosh-$VERSION"
PREVDIR=$PWD
TARFILE="$DIR.tar.gz"

rm -Rf $DIR
mkdir $DIR

cp -R images src/*.js strophe/*.js tests/*.js package.json \
README.TXT INSTALL.TXT EMBEDDING.TXT release.sh \
run-server.js lintit.sh monitor.js bosh.conf.example.js \
$DIR

cd $DIR

if [[ $PWD == $PREVDIR ]]; then
  exit 1
fi

rm tests/sr_users.js
find -name ".svn" | xargs rm -Rf

cd ..

tar -zvcf $TARFILE $DIR

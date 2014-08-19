#!/bin/sh
printf "Generates sample certificate and puts it in <server>/cert directorry for easier testing."
printf "Requires openssl."
printf "Run '<this script> pfx' to generate 'pfx' package certificate."
scriptPath=${0%/*}

if [ ! -d "$scriptPath/../cert" ]; then mkdir "$scriptPath/../cert"; fi

openssl req \
-new \
-x509 \
-days 731 \
-sha1 \
-newkey rsa:2048 \
-nodes \
-keyout "$scriptPath/../cert/server.key" \
-out "$scriptPath/../cert/server.crt" \
-subj '/O=Snakeoil/OU=Snakeoil/CN=Snakeoil.sl'

if [ x"$1" = x"pfx" ]; then
	openssl pkcs12 -export -in "$scriptPath/../cert/server.crt" \
	-inkey "$scriptPath/../cert/server.key" \
	-out "$scriptPath/../cert/server.pfx" \
	-password pass:
	rm "$scriptPath/../cert/server.crt"
	rm "$scriptPath/../cert/server.key"
fi
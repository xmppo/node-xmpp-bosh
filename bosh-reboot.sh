#!/bin/bash
sudo cp -R src /usr/lib/node_modules/node-xmpp-bosh/
sudo service bosh stop
sudo service bosh start


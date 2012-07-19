# Release Checklist

* Verify if package installs and runs correctly
* Update ```whats_changed.md``f if necessary
* Check if version in package.json is okay
* Apply version tag (e.g. v0.6.1 [=TAG]) to current HEAD
* Check if local copy is pushed to origin/master on github
* Upload to npm using ```npm publish https://github.com/dhruvbird/node-xmpp-bosh/tarball/TAG```
* Tweet about it, and post on identi.ca

# A step-by-step help to install and configure node-xmpp-bosh on a Debian system.

## Introduction

node-xmpp-bosh installation can be really hard without knowledge of the UNIX shell and associated commands. In this help section, we shall provide instructions for a step-by-step installation of node-xmpp-bosh on Debian and Debian-based systems, like Ubuntu.

## node.js installation

node.js is generally installed by compiling it from source. If you are unsure how to do this and would prefer installing the binaries, you can get hold of a Debian based system which has the _nodejs_ package in the official repository. If you install pre-compiled binaries, you can skip the step of compiling node.js.

First, we install the dependencies:

```apt-get install libssl-dev python subversion git git-core libexpat1 libexpat1-dev```

Then, we install the latest node.js from source

```wget http://nodejs.org/dist/v0.6.19/node-v0.6.19.tar.gz```

```tar -zxvf node-v0.6.19.tar.gz```

```cd ./node-v0.6.19```

Finally, we start compiling node.js (this can take a few minutes):

`./configure --prefix=/usr; make; make install`

Note: configure may ask you to install some missing packages if the required compilation tools are not present on the system.

## Installation of External Modules

node-xmpp-bosh depends on external node.js modules. For simplicity, we let [npm](http://npmjs.org/) manage these dependencies. See [INSTALL.md](https://github.com/dhruvbird/node-xmpp-bosh/blob/master/INSTALL.md) for details on how to install npm and node-xmpp-bosh using npm.

**Either ways, npm needs to be installed.**

Alternatively, we can fetch just node-xmpp-bosh from github and let npm install the dependencies.

## node-xmpp-bosh installation

Once node.js and node-xmpp-bosh dependencies are installed, we can install node-xmpp-bosh itself and change its configuration.

## node-xmpp-bosh itself (from GIT)

Get the latest node-xmpp-bosh version from [here](https://github.com/dhruvbird/node-xmpp-bosh/tags), or get the master branch from [github](https://github.com/dhruvbird/node-xmpp-bosh).

```cd /usr/local/lib/bosh```

```git clone git://github.com/dhruvbird/node-xmpp-bosh.git```

Now, we use npm to automatically fetch the dependencies for us.

```npm install .```

Using GIT allows you to update node-xmpp-bosh quickly to the last development version using the following commands:

```cd /usr/local/lib/bosh```

```git pull```

After an update, you will need to restart node-xmpp-bosh using the init.d command (see after).

## node-xmpp-bosh configuration

Copy the node-xmpp-bosh sample configuration file in a new file:

```cp /usr/local/lib/bosh/bosh.conf.example.js /etc/bosh.js.conf```

Then, open it and configure it to meet your needs!

A little warning about the logging feature: if your BOSH server will receive a huge amount of data, please consider setting the _logging_ option to _FATAL_ to avoid getting your disk system full quickly.

## node-xmpp-bosh logs

To be able to report the crash logs to the node-xmpp-bosh issue tracker, you have to create the logging folder and the logging files:

```mkdir /var/log/bosh```

Then, the two logging files:

```touch /var/log/bosh.log /var/log/bosh.err```

Finally, apply permissive rights to the whole:

```chmod 777 -R /var/log/bosh```

## Installing startup scripts

Some startup scripts may be useful to make the node-xmpp-bosh process management faster.

### init.d script

node-xmpp-bosh will not be launched on system startup once installed, that's why you'd better use the following init.d script. Firstly, create the file:

```touch /etc/init.d/bosh```

Then, apply permissive rights:

```chmod 777 /etc/init.d/bosh```

Open the file:

```nano /etc/init.d/bosh```

Paste the following content:

```
#! /bin/sh
#
# bosh        Start/stop node-xmpp-bosh server
#

### BEGIN INIT INFO
# Provides:          bosh
# Required-Start:    $remote_fs $network $named $time
# Required-Stop:     $remote_fs $network $named $time
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
# Short-Description: Starts node-xmpp-bosh server
# Description:       Starts node-xmpp-bosh server, an XMPP
#                    BOSH server written in JavaScript.
### END INIT INFO

PATH=/sbin:/bin:/usr/sbin:/usr/bin
NODE_PATH=/usr/local/lib/node
BOSH=/usr/local/bin/bosh
NAME=run-server.js

test -e $BOSH || exit 0

start()
{
    if ! pgrep -f $NAME
    then
        export NODE_PATH
        $BOSH
    fi
}

stop()
{
    killall node
}

case "$1" in
    start)
	echo -n "Starting bosh server"
	start &
    ;;
    stop)
	echo -n "Stopping bosh server"
	stop &
    ;;
    restart)
	echo -n "Restarting bosh server"
	$0 stop
	$0 start
    ;;
    *)
	echo "Usage: $0 {start|stop|restart}" >&2
	exit 1
    ;;
esac

if [ $? -eq 0 ]; then
    echo .
else
    echo " failed."
fi

exit 0
```

Save it (CTRL+O using nano).

Then, you have to create the related command script:

```touch /usr/local/bin/bosh```

Then, apply permissive rights:

```chmod 777 /usr/local/bin/bosh```

Open the file:

```nano /usr/local/bin/bosh```

Paste the following content:

```
#!/usr/bin/env sh
exec /usr/local/lib/bosh/run-server.js "$@" >> /var/log/bosh/bosh.log 2>> /var/log/bosh/bosh.err &
```

Save it (CTRL+O using nano).

Once done, you will be able to start, stop or restart node-xmpp-bosh using this command:

```/etc/init.d/bosh {start|stop|restart}```

## cronjob

To avoid any downtime of your BOSH service, you may want to use a cronjob to start node-xmpp-bosh if not started (the check is proceeded every minute).

First, execute this:

```crontab -e```

Then, at the end of the file, paste this:

```*/1 * * * * /etc/init.d/bosh start >>/dev/null```

Save it (CTRL+O using nano), the cronjobs will be updated.

Remember this solution is not the best (not really clean), but is simple and works fine. Advanced users may want to use [daemontools](http://cr.yp.to/daemontools.html).

## Installing node-xmpp-bosh


NOTE: Debian and Debian-based system users may use the detailed
step-by-step instructions on how-to to install node-xmpp-bosh,
contained in [DEBIAN_HOW_TO.md](https://github.com/dhruvbird/node-xmpp-bosh/blob/master/DEBIAN_HOW_TO.md)

1. Install [node.js](http://nodejs.org/) (possibly at
/opt/node-VERSION so that you can have multiple
versions). node-xmpp-bosh has been tested with node v0.4.x - v0.6.x

2. Set the node executable in the path (if not already set and also
add to .bashrc):

    ```
    $ export PATH=/opt/PATH-TO-NODE/bin/:$PATH
    ```

3. Set the NODE_PATH variable and add to .bashrc:

    ```
    $ export NODE_PATH=/opt/PATH-TO-NODE/lib/node_modules/:$NODE_PATH
    ```

4. Test node:

    ```
    $ node
    ```

5. Install npm: https://github.com/isaacs/npm

    ```
    curl http://npmjs.org/install.sh | sh
    ```

6. If you are a developer, goto step [10]

7. The following command will install node-xmpp-bosh along with all
its dependencies. Go to the directory where you want to install
node-xmpp-bosh.

    ```
    $ cd ~/
    $ npm install node-xmpp-bosh
    ```

8. Run the proxy (test it)

    ```
    $ node node_modules/node-xmpp-bosh/run-server.js
    ```
Now press Ctrl+C to exit (assuming it ran fine)

9. Report any bugs at https://github.com/dhruvbird/node-xmpp-bosh/issues.
You are done!

10. These instructions are only for developers who want to get the
latest version from git.

    ```
    $ cd <your project directory>
    ```

11. ```$ git clone https://github.com/dhruvbird/node-xmpp-bosh```

12. ```$ cd node-xmpp-bosh```

13. Install all dependencies

    ```
    $ npm install .
    ```

14. Set the executable flag on run-server.js:

    ```
    $ chmod +x run-server.js
    ```

15. Test it out!

    ```
    $ node run-server.js
    ```
Now press Ctrl+C to exit (assuming it ran fine)

16. Goto step [9]

# node-bosh-xmpp #

## Motivation ##

Are you using [node-xmpp](https://github.com/astro/node-xmpp) for XMPP? But get blocked by coorperate firewalls? Then
[node-bosh-xmpp](https://github.com/eelcocramer/node-xmpp-via-bosh) is API compatible with [node-xmpp](https://github.com/astro/node-xmpp)
and gives you the ability to use XMPP over a standard HTTP port.

## Credits go to Anoopc ##

I was looking for a BOSH XMPP client for node and came accross Anoop's [node-xmpp-via-bosh](https://github.com/anoopc/node-xmpp-via-bosh) implementation.
His code was not completely working for me so I forked his code and fixed the issue I was having. I wanted to be able to specify
the URL of the BOSH server and I also had some issues with the authorization proces.

## Installation instructions ##

	npm install node-bosh-xmpp-client

## Code instructions ##

Following you will find the documentation from Anoop which I updated to reflect my changes:

It is inspired by node-xmpp (https://github.com/astro/node-xmpp) and xmppjs(http://github.com/mwild1/xmppjs) and
it is API compatible with node-xmpp (except for the constructor).

It is an xmpp library which lets you establish a persistent session to xmpp server 
via a bosh-server and communicate willingly.

## Documentation for API ##

* Constructor: `Client(jid, password, bosh, route)`  
		
		Parameters:  
		
            *jid*       : [String] jabber id of user (e.g. `user@example.com/office`)  
            *password*  : [String] password  
            *bosh*      : [String] url of the bosh-server (e.g. `http://localhost:5280/http-bind/`)  
            *route*     : [String] route attribute [if used] for connecting to xmpp server  
        Return Value:  

            new Client Object having following properties:  

	1. Event-emitter for the following events
	
		`online`
			Event-listener: `function callback()`
	
		`error`
			Event-listener: `function callback(exception)`
			
			`exception[String]` is the description of error

		`offline`
			Event-listener: `function callback(condition)`
					  
			`condition[String]` is the description of reason for being offline

		`stanza`
			Event-listener: `function callback(stanza)`
			
			`stanza[Object]` is the ltx xml element. 

	2. Function: `send(stanza)`
		
		enqueues the stanza into the pending array to be sent to bosh-server on next Tick
		parameters:
		
			*stanza* : [Object] ltx xml Element object

	3. Function: `sendMessage(to, body, type = "chat")`
	    
		sends a message 'body' to jid 'to' with type set to 'type'
		
		parameters:

			*to*   : [String] jid of receiver(e.g. `myfriend@example.com/home`)
			*body* : [String] message to be sent
			*type* : [String] should only be among the permitted values of `type` for xmpp message stanza

	4. Function: `disconnect()`
	
		sends immediately any pending stanzas, ends the stream by sending terminate packet.

* Constructor `Element(xname, attrs)`

		alias to `ltx.Element` Constructor

* Function: `$build(xname, attrs)`

		an alias for `new ltx.Element(xname, attrs)`
		
		Parameters:
		
			*xname* : [string] name for the xml element
			*attrs* : [Object] containing all the attributes to set up
			
		Return value:
		
			a new ltx.Element object

* Function: `$msg(attrs)`

		an alias for `new ltx.Element("message", attrs)`
		
		Parameters:
		
			*attrs* : [Object] containing all the attributes to set up
			
		Return value:
		
			a new ltx.Element object

* Function: `$iq(attrs)`

		an alias for `new ltx.Element("iq", attrs)`
		
		Parameters:
		
			attrs : [Object] containing all the attributes to set up
			
		Return value:
		
			a new ltx.Element object
 
* Function: `$pres(attrs)`

		an alias for `new ltx.Element("presence", attrs)`
		
		Parameters:
		
			*attrs* : [Object] containing all the attributes to set up
			
		Return value:
		
			a new ltx.Element object

* Function: `setLogLevel(logLevel)`

		sets the logLevel for module (use only when in serious problem i.e. debug mode).
		
		Parameters:
		
			*logLevel* : [String] permissible values:
			
			       *FATAL*	:	displays nothing [default]
				   *ERROR*	:	displays error messages
				   *INFO*	:	informs about important events
				   *DEBUG*	:	prints each packet sent and received

## Shout outs ##

Shout outs go to the [Webinos project](http://www.webinos.org). They provided the time and need to make this fix.

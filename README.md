# CloudKeyboard Server

Cloud Keyboard server is the backend for cloud-keyboard-app, adapted from
WiFiKeyboard by Ivan Volosyuk. It is basically a relay between the web
browser client and the Android device, with a UUID-based pairing
mechanism

It runs on Node.js/Express (therefore it runs on only one thread).
The important code is almost entirely
contained in two source files -- resource/client-interface.html and
server.js.

## Installing and running a server

First install [[node.js|http://nodejs.org]].

Checkout the git repository somewhere.

In a shell (Windows, bash etc.), navigate to the root of the git repo
and install node.js/express:

  $ npm install express

Adjust your port settings in server.js (just search for 'port')

Run the server:

  $ node run_server.js



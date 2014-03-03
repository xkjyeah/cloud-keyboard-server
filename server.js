
// FIXME: Use base64 because it is shorter
// and makes better use of keyboard keys

var CloudKbServer = {
  'server' : null
};

var d2cBuffers = {};
var c2dBuffers = {};

function generateSharedKey() {
  var uuid = require('node-uuid');
  var v4 = uuid.v4();
  
  // a uuid is 8-4-4-4-12
  // to extract the parts...
  var keyChars = [
    v4.substring(0,4),
    v4.substring(4,8),
    
    v4.substring(9,13),
    
    v4.substring(14,18),
    
    v4.substring(19,23),
    
    v4.substring(24,28),
    v4.substring(28,32),
    v4.substring(32,36)
  ]
  .join('')
  .toUpperCase()
  .split('');
  
  // TODO: convert to base-32: alphanumeric without I, O, Y, Z
  var bitOffset = 0;
  var current = 0;
  var newBase = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  var rebased = [];
  
  while (keyChars.length != 0) {
    while ( keyChars.length != 0 &&
      bitOffset < 5 ) {
      // take a character
      var ch = keyChars.pop();
      
      // conert to numeric value
      ch = ( ch.charCodeAt(0) >= 'A' ) ? ch.charCodeAt(0) - 'A' + 10 :
        ch.charCodeAt(0) - '0';
      
      current += (ch << bitOffset);
      
      bitOffset += 4;
    }
    
    while ( bitOffset >= 5 ||
      (bitOffset > 0 && keyChars.length == 0) ) {      
      // convert the base
      rebased.splice(0,0,newBase[ current % 32 ]);
      bitOffset -= 5;
      current = current >> 5;
    }
  }
  
  return rebased.join('');
}

// Display the login form
// If logged in, redirect to the interface
function clientLoginInterface(req, res) {
  if (req.session != null
  && req.session.hasOwnProperty('shared-key')
  /* TODO: && req.session['shared-key'] is valid */) {
    res.redirect('/clients/');
    return;
  }
  
  res.sendfile('resources/client-login.html');
}

function loadResource(req, res) {
  var path = req.path;
  path = path.replace( /[\\]/, '' );
  path = path.substr( path.lastIndexOf('/') + 1 );
  res.sendfile('resources/' + path);
}

function validSharedKey(sk) {
  return c2dBuffers.hasOwnProperty(sk) && 
  d2cBuffers.hasOwnProperty(sk);
}

/* Strips non-hexadecimal letters from the code */
function processSharedKey(raw_sk) {
  return raw_sk.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/* Adds a space after every 4 letters */
function formatSharedKey(sk) {
  return sk.toUpperCase()
    .replace(/...../g, function (match, orig) { return match + ' '; });
}

// Process form login
// On success, location to the interface
function clientLogin(req, res) {
  var sharedKey;
  if (req.body.hasOwnProperty('shared-key') &&
  (sharedKey = processSharedKey(req.body['shared-key'])) != null &&
  validSharedKey(sharedKey) ) {
    req.session['shared-key'] = sharedKey;
    console.log('Good login');
    res.redirect('/clients/');
  }
  else {
    console.log('Bad login');
    res.redirect('/clients/login');
  }
}

function clientLogout(req, res) {
  if (req.session != null
  && req.session.hasOwnProperty('shared-key')
  /* TODO: && req.session['shared-key'] is valid */) {
    delete req.session['shared-key'];
  }
  res.redirect('/clients/login');
}

function clientInterface(req, res) {
  var sharedKey;
  console.log('Presenting interface');
  
  if ( req.session.hasOwnProperty('shared-key') &&
  (sharedKey = req.session['shared-key']) != null &&
  validSharedKey(sharedKey) ) {
    res.sendfile('resources/client-interface.html');
    //res.send('');
  }
  else {
    console.log(sharedKey);
    console.log(validSharedKey(sharedKey));
    res.redirect('/clients/login');
  }
}

function clientEvent(req, res) {
  // not logged in...
  var sharedKey;
  if (! req.session.hasOwnProperty('shared-key') ||
  ( (sharedKey = req.session['shared-key'])  != null &&
  !validSharedKey(sharedKey)) ) {
    res.json(401, {'result':0,'message':'Not logged in'});
    return;
  }
  
  // logged in. reply messages with error handling
  // FIXME: without error handling, this will only
  // work reliably on a stable connection (e.g., not
  // on a train
    //console.log(JSON.stringify(req.body));
  if ( req.body.hasOwnProperty('events') &&
    req.body.events instanceof Array ) {
    
    
    // send to device
    c2dBuffers[sharedKey] =
      c2dBuffers[sharedKey].concat(req.body.events);
    
    // send to client
    var replies = d2cBuffers[sharedKey];
    d2cBuffers[sharedKey] = [];
    
    res.json({'replies': replies});
  }
  else {
    res.json({});
  }
}

function deviceLogin(req, res) {
  var result = 1;
  // Already logged in -- ignore;
  console.log('session: ' + JSON.stringify(req.session));
  console.log('cookies: ' + JSON.stringify(req.cookies));
  console.log('signedCookies: ' + JSON.stringify(req.signedCookies));
  if (req.session.hasOwnProperty('shared-key')) {
    console.log('Device logged in using old key');
    result = 0;
  }
  else {
  // Otherwise...
    console.log('New device logged in');
    req.session['shared-key'] = generateSharedKey();
  }
  var sharedKey;
  sharedKey = req.session['shared-key'];
  
  c2dBuffers[sharedKey] = [];
  d2cBuffers[sharedKey] = [];
  // FIXME: ensure shared key not repeated...
  // although should not happen since it is UUID
  res.send(JSON.stringify({
    'result':result,
    'shared-key':formatSharedKey(sharedKey)
  }));
}

function deviceLogout(req, res) {
  var sharedKey;
  if (req.session.hasOwnProperty('shared-key')) {
    console.log('Device logged out');
    sharedKey = req.session['shared-key'];
    delete req.session['shared-key'];
    delete c2dBuffers[sharedKey];
    delete d2cBuffers[sharedKey];
  }
  res.send(JSON.stringify({'result':1}));
}

function devicePoll(req, res) {
  // not logged in...
  var sharedKey;
  if (! (req.session.hasOwnProperty('shared-key'))) {
    res.json(401, {'result':0,'message':'Not logged in'});
    return;
  }
  
  sharedKey = req.session['shared-key'];
  // logged in. reply messages with error handling
  // FIXME: without error handling, this will only
  // work reliably on a stable connection (e.g., not
  // on a train
  
    //console.log(JSON.stringify(req.body));
  if ( req.body.hasOwnProperty('replies') &&
    req.body.replies instanceof Array ) {
    
    // send to client
    d2cBuffers[sharedKey] =
      d2cBuffers[sharedKey].concat(req.body.replies);
    
    // send to device
    var events = c2dBuffers[sharedKey];
    c2dBuffers[sharedKey] = [];
    
    res.json({'events': events});
  }
  else {
    res.json({});
  }
}

function start() {
  var express = require('express');
  var http = require('http');
  var app = express();
  
  app.use(express.cookieParser('I killed your father'));
  app.use(express.session());
  app.use(express.json());
  app.use(express.urlencoded());
  
  app.get('/', clientLoginInterface);
  app.get('/clients/login', clientLoginInterface);
  app.post('/clients/login', clientLogin);
  app.all('/clients/logout', clientLogout);
  app.all('/clients/', clientInterface);
  app.post('/clients/key', clientEvent);
  
  app.all('/devices/login', deviceLogin);
  app.all('/devices/logout', deviceLogout);
  app.post('/devices/poll', devicePoll);

  app.all('/resources/*', loadResource);
  
  app.use(app.router);
  app.use(function (req, res, next) {
    // respond with html page
    if (req.accepts('html')) {
      res.send(404, "Invalid!");
      return;
    }

    // respond with json
    if (req.accepts('json')) {
      res.send(404, { error: 'Not found' });
      return;
    }

    // default to plain-text. send()
    res.type('txt').send('Not found');
  });
  
  // app.listen(8080);
  var port = 8080;
  CloudKbServer.server = http.createServer(app);
  CloudKbServer.server.listen(8080, function() {
    console.log('HTTP Server listening on port ' + port);
  });
}
function stop() {
  CloudKbServer.server.close( function() {
    console.log('CloudKB Server stopped');
  });
  CloudKbServer.server = null;
}

module.exports = {
  'start' : start,
  'stop' : stop,
  'debug' : function() { return [ d2cBuffers, c2dBuffers ]; },
  'gensk' : generateSharedKey
}

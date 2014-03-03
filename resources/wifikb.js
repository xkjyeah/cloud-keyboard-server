
if (typeof XMLHttpRequest == "undefined")
 XMLHttpRequest = function () {
   try { return new ActiveXObject("Msxml2.XMLHTTP.6.0"); }
   catch (e) {}
   try { return new ActiveXObject("Msxml2.XMLHTTP.3.0"); }
   catch (e) {}
   try { return new ActiveXObject("Msxml2.XMLHTTP"); }
   catch (e) {}
   //Microsoft.XMLHTTP points to Msxml2.XMLHTTP.3.0 and is redundant
   throw new Error("This browser does not support XMLHttpRequest.");
};

// format: /seq,code,press/5012,32,1/
ignore_next_char = false;
repeat_key_code = "-1";

seqConfirmed = 12345;
seqPressed = seqConfirmed;

// Sequence number is just used to collect replies
seqNumber = parseInt(Math.random() * 10000);
events = [];
inflight_keys = [];
last_preview_before = '';
last_preview_after = '';
num_inflight = 0;
num_delayed = 0;
latency = 0;
latency2 = 0;
latencyTime = 0;
latencyTime2 = 0;
displayState = "loading";
stat = null;
inp = null;
typed_chars = 0;

var poller = null;

function onConfirm(newConfirmed) {
    /*if (newConfirmed == seqPressed) {
        events = []; // clear events
    }
    if (newConfirmed <= seqConfirmed) return;
    for (i = seqConfirmed; i < newConfirmed; i++) {
        events[i] = undefined;
        seqConfirmed = newConfirmed;
    }*/
    network();
}

function queue(code, mode) {
    ev = mode + code;
    
    // TODO: Do we really want a sequence number?
    events.push( { 'type': 'key', 'data': ev } );
//      var el = document.getElementById("keys");
//      el.innerHTML = el.innerHTML + ' send:' + mode + code + " ";
}

function send(code, mode) {
    queue(code, mode);
    updatePreview();
    network();
}

/* Sends keypresses that have not been sent yet */
function network() {
    var send_data = [];
    
    if (events.length == 0) return;
    if (num_inflight > 0) {
        console.log('blocked!');
        return;
    }
    
    // else copy the first 100 into a new Array
    for (var i=0; i<events.length && i<100; i++) {
        send_data.push(events.shift());
    }
    inflight_keys.push(eventsToString(send_data));
    updatePreview();

    // get a snapshot of the text
    send_data.push( { type: 'gettext_before', 'seq': seqNumber } );
    seqCallbacks[seqNumber] = function(data) {
        inflight_keys.shift();
        last_preview_before = data.data;
        updatePreview();
    };
    send_data.push( { type: 'gettext_after', 'seq': seqNumber } );
    seqCallbacks[seqNumber] = function(data) {
        inflight_keys.shift();
        last_preview_after = data.data;
        updatePreview();
    };
    seqNumber++;
    
    makeXhr({'events': send_data });
}

function compat() {
  return !document.f.mode[0].checked;
}

function is_special(code) {
    if (code <= 40) {
        if (code >= 33) return true;
        if (code == 8 || code == 9 || code == 13 || code == 27) return true;
        if (code >= 16 && code <= 20) return true;
    } else {
        if (code == 42 || code == 45 || code == 46 || code == 93 || code == 145) return true;
        if (code >= 112 && code <= 123) return true;
    }
    return false;
}
function keyevent(key, mode) {
    if (compat()) {
        ignore_next_char = mode == 'D';
        repeat_key_code = key;
        send(key, mode);
        return false;
    }
    if (is_special(key)) {
        ignore_next_char = mode == 'D';
        repeat_key_code = key;
        send(key, mode);
        return false;
    }
    ignore_next_char = false;
    return true;
}

function update_input() {
    typed_chars++;
}

function examine_input() {
    if (inp == null) {
        inp = document.getElementById("in");
    }
    if (inp == null) {
        typed_chars = 0;
        return;
    }
    var val = inp.value;
    if (val.length == 0) {
        typed_chars = 0;
        return;
    }

    // if not paste and not chinese
    if (val.length <= typed_chars
    && val.charCodeAt(0) < 128) {
        return;
    }
    for (i = 0; i < val.length; i++) {
        queue(val.charCodeAt(i), 'C');
    }
    typed_chars = 0;
    inp.value = "";
    network();
}

function up(e) {
  examine_input();
  if (!e) e = window.event;
  return keyevent(e.keyCode, 'U');
}
function down(e) {
  update_input();
  if (!e) e = window.event;
  if (e.keyCode == 115) {
    no_input();
    recv_text();
    return false;
  }
  return keyevent(e.keyCode, 'D');
}
function press(e) {
  if (ignore_next_char) {
     ignore_next_char = false;
     return false;
  }
  if (compat()) return false;
  if (!e) e = window.event;
  if (e.charCode != undefined) {
    ch = e.charCode;
  } else {
    ch = e.keyCode;
  }

  // firefox and opera hack
  if (ch == 0 || ch == repeat_key_code) {
    send(repeat_key_code, 'D');
    return false;
  }
  send(ch, 'C');
  return false;
}
function focus_me() {
  document.getElementById("in").focus();
}

function setDisplayState(newState) {
  if (newState == displayState) return;
  displayState = newState;

  if (stat == null) {
    stat = document.getElementById("status");
    xcomment = document.getElementById("comment");
  }
  if (stat == null) return;

  if (newState == "connected") {
    stat.innerHTML = "Connected";
    stat.style.color = "green";
    xcomment.innerHTML = "You can type now.";
  } else if (newState == "failure") {
    stat.innerHTML = "Connection problem";
    stat.style.color = "red";
    xcomment.innerHTML = "No connection between the phone and computer.";
  } else if (newState == "problem") {
    stat.innerHTML = "Not typing";
    stat.style.color = "red";
    xcomment.innerHTML = 'Enable WiFiKeyboard input on you device. <a href="http://code.google.com/p/wifikeyboard/wiki/WiFiKeyboardSettings">Visit help page.</a>';
  } else if (newState == "multi") {
    stat.innerHTML = "Mutiple input";
    stat.style.color = "red";
    xcomment.innerHTML = "Typing from multiple browser windows is not supported. Use one browser window.";
  }
}

/** If receive an error, repeat the request. Otherwise
    handle each returning input. For each reply, if there
    is a sequence number, call the callback associated with
    the sequence number.
*/
var seqCallbacks = {};

function manageDisplayStatus(replies) {
    var lastStatus = 'connected';
    
    for (var i=0; i<replies.length; i++) {
        switch (replies[i].result) {
        case 0:			// success
            lastStatus = 'connected';
            break;
        case 1:
        default:
            lastStatus = 'problem';
            break;
        }
        
    }		
    setDisplayState(lastStatus);
}

function manageCallbacks(replies) {
    for (var i=0; i<replies.length; i++) {
    
        var seq;
        if ( (seq = replies[i].seq) ) {
            seqCallbacks[seq](replies[i]);
            delete seqCallbacks[seq]; // delete
        }
        
    }
}

function xhrHandler(xhr, data, callback) {
    return function() {
        if (xhr.readyState != 4) return;
        
        if (xhr.status != 200) {
            setDisplayState('failure');
            setTimeout(
                function() {console.log('xhrhandler');makeXhrRequest(data)},
                2000);
        }
        else {
            var reply = JSON.parse(xhr.responseText);
            var lastStatus = 'connected';
            
            console.log('xhrhandler: ' + xhr.responseText);
            
            if (callback !== undefined) callback();
            manageDisplayStatus(reply.replies);
            manageCallbacks(reply.replies);
        }
    };
}

function makeXhrRequest(data, callback) {
    var submitter = new XMLHttpRequest();

    submitter.onreadystatechange = xhrHandler(submitter, data, callback);
    submitter.open('POST', "/clients/key", true);
    submitter.setRequestHeader("Content-type", "application/json");
    submitter.send(data);
}

function eventsToString( arr ) {
    return arr.map(function (dt) {
                return (dt.type == 'key' && dt.data.charAt(0) == 'C' ) ? String.fromCharCode(dt.data.substr(1)) : '';
    }).join('');

}

// Send keypress messages
// Unlike makeXhrRequest, this one rate limits itself
function makeXhr(send_data) {
    // TODO: if there is an error, logically I will
    // want to append more keys to it instead of
    // replying with the original input, to maximize
    // the throughput
    
    var xhr = new XMLHttpRequest();
    
    num_inflight++;
    
    console.log(num_inflight);
    console.log(send_data);
    xhr.onreadystatechange = function() {
        if (xhr.readyState != 4) return;
        
        if (xhr.status != 200) {
            setDisplayState('failure');
            
            // FIXME: this WILL reorder requests
            // if I start typing in between fialures
            setTimeout(
                function() {
                    makeXhr(send_data)
                },
                2000);
        }
        else {
            var reply = JSON.parse(xhr.responseText);
            
            num_inflight--;
            console.log('Make XHR problem');
            console.log(xhr.responseText);

            manageDisplayStatus(reply.replies);
            manageCallbacks(reply.replies);
            network();
        }
    };
    
    xhr.open('POST', "/clients/key", true);
    xhr.setRequestHeader("Content-type", "application/json");
    xhr.send(JSON.stringify(send_data));
    console.log('makeXHR');
}


function submit_text2() {
    var params = document.getElementById("in").value;
    var send_data = JSON.stringify({
        'events': [
            {'type': 'settext', 'data': params, 'seq': seqNumber}
            ,{'type': 'key', 'data': 'D17'}
            ,{'type': 'key', 'data': 'D13'}
            ,{'type': 'key', 'data': 'U17'}
            ,{'type': 'key', 'data': 'U13'}
        ]
    });
    
    seqCallbacks[seqNumber] = function(dt) {
        // set text successful!
        document.getElementById('in').value = "";
    };
    console.log('submit_text2');
    makeXhrRequest(send_data);
    seqNumber++;
  }
function submit_text() {
    var params = document.getElementById("in").value;
    var send_data = JSON.stringify({
        'events': [
            {'type': 'settext', 'data': params, 'seq': seqNumber}
        ]
    });
    
    seqCallbacks[seqNumber] = function(dt) {
        // set text successful!
        document.getElementById('in').value = "";
        direct_input();
    };
    console.log("submit_text");
    makeXhrRequest(send_data);
    seqNumber++;
  }
  
function recv_text() {
    var recvText = new XMLHttpRequest();
    recvText.onreadystatechange = function() {
        if (recvText.readyState != 4) return;
        if (recvText.status != 200) {
            // FIXME: error handling
            setTimeout("recv_text();", 2000);
        }
        if (recvText.responseText != undefined) {
            var recvData = JSON.parse(recvText.responseText);
            document.getElementById('in').value = recvData.replies[0].data;
            local_input();
        }
    }
    var send_data = JSON.stringify( {
        'events': [
            { 'type' : 'gettext', 'seq': seqNumber }
        ]
    });
    console.log('recv_text');
    makeXhrRequest(send_data);
    seqCallbacks[seqNumber] = function(data) {
        // get text successful
        document.getElementById('in').value = data['data'];
        local_input();
    };
    seqNumber++;
}
function poll() {
    /* already polling ...*/
    if (poller !== null) {
        clearTimeout(poller);
        console.log('polling reset');
    }

    var waitingCallback = Object.keys(seqCallbacks).length > 0;
    
    if (waitingCallback) {
        console.log('poll');
        makeXhrRequest(JSON.stringify( {
            'events': []
        } ), function () { // callback when succeeded
            setTimeout(poll, 2000);
        });
    }
    else {
        poller = setTimeout(poll, 2000);
    }
}
function updatePreview() {
    document.getElementById('preview_actual_before').textContent = last_preview_before;
    document.getElementById('preview_inflight').textContent = inflight_keys.join('');
    document.getElementById('preview_events').textContent = eventsToString(events);
    document.getElementById('preview_actual_after').textContent = last_preview_after;
}

function direct_input() {
    var x = document.getElementById("in");
    x.onkeydown = down;
    x.onkeyup = up;
    x.onkeypress = press;
    window.onblur = function() {
        send(1024,'D');
        focus_me();
    }
    window.onfocus = focus_me;
    window.onmouseup = function() {
        setTimeout(examine_input, 10);
    };
    window.onmouseover = function() {
        setTimeout(examine_input, 10);
    };
    n = document.getElementById("in");
    n.style.backgroundColor = "#f1f1ed";
    n.value = "";
    
    document.getElementById('legend').classList.remove('legend_indirect');
}

function no_input() {
    document.getElementById("in").style.backgroundColor = "#f1e1cd";
    var x = document.getElementById("in");
    x.onkeydown = function(e) { return false; }
    x.onkeypress = function() { return false; }
    x.onkeyup = function() { return false; }
    window.onblur = function() {}
    window.onmouseup = function() {};
    window.onmouseover = function() {};
}

function local_input() {
    document.getElementById('legend').classList.add('legend_indirect');
    
    document.getElementById("in").style.backgroundColor = "#FFFFFF";
    var x = document.getElementById("in");
    x.onkeydown = function(e) {
        if (!e) e = window.event;
        if (e.keyCode == 115) {
            submit_text();
            no_input();
            return false;
        }
        if (e.ctrlKey && e.keyCode == 13) {
            submit_text2();
        }
        return true;
    };
    x.onkeypress = function() { return true; }
    x.onkeyup = function() { return true; }
}


function loadFinished() {
  focus_me();
  send(1024, 'D');
  direct_input();
  (function() {
         /*var wf = document.createElement('script');
         wf.src = ('https:' == document.location.protocol ? 'https' : 'http') +
             '://ajax.googleapis.com/ajax/libs/webfont/1/webfont.js';
         wf.type = 'text/javascript';
         wf.async = 'true';
         wf.onload = function() {
             WebFont.load({
                 google: {
                   families: [ 'Cantal', 'Yanone Kaffeesatz', 'Droid Sans' ]
              }});
         }
         var s = document.getElementsByTagName('script')[0];
         s.parentNode.insertBefore(wf, s);*/
       })();
    poll();
}
window.onload = loadFinished;
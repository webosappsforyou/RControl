// A WebSocket to TCP socket proxy
// Copyright 2010 Joel Martin
// Licensed under LGPL version 3 (see docs/LICENSE.LGPL-3)
 // Node.js require load
var ProxyAssistant = function() {
}

 if (typeof require === "undefined") {
    require = IMPORTS.require;
 }

var net = require('net'),
    sys = require('sys'),
    crypto = require('crypto'),
    source_arg, source_host, source_port,
    target_arg, target_host, target_port;

ProxyAssistant.prototype.run = function(future,subscription) {
//    console.log("***************Debugging "+ this.controller.args.sarg);
source_arg = this.controller.args.sarg;
target_arg = this.controller.args.targ;




// md5 calculation borrowed from Socket.IO (MIT license)
function gen_md5(headers, k3) {
    var k1 = headers['sec-websocket-key1'],
        k2 = headers['sec-websocket-key2'],
        md5 = crypto.createHash('md5');

    [k1, k2].forEach(function(k){
    var n = parseInt(k.replace(/[^\d]/g, '')),
        spaces = k.replace(/[^ ]/g, '').length;

    if (spaces === 0 || n % spaces !== 0){
        return false;
    }

    n /= spaces;

    md5.update(String.fromCharCode(
        n >> 24 & 0xFF,
        n >> 16 & 0xFF,
        n >> 8  & 0xFF,
        n       & 0xFF));
    });

    md5.update(k3.toString('binary'));

    return md5.digest('binary');
}

function encode(buf) {
    return String.fromCharCode(0) + 
           buf.toString('base64', 0) +
           String.fromCharCode(255);
}

function decode(data) {
    var i, len = 0, strs, retstrs = [],
        buf = new Buffer(data.length),
        str = data.toString('binary', 1, data.length-1);

    if (str.indexOf('\xff') > -1) {
        // We've gotten multiple frames at once
        strs = str.split('\xff\x00')
        for (i = 0; i < strs.length; i++) {
            len = buf.write(strs[i], 0, 'base64');
            retstrs.push(buf.toString('binary', 0, len));
        }
        return retstrs.join("");
    } else {
        len = buf.write(str, 0, 'base64');
        return buf.toString('binary', 0, len);
    }
}


var server = net.createServer(function (client) {
    var handshake = "", headers = {}, header,
        version, path, k1, k2, k3, target = null;

    function cleanup() {
        client.end();
        if (target) {
            target.end();
            target = null;
        }
    }

//    this.interval = setInterval(function ping() {
//        var f = subscription.get();
//        f.result = { reply: "ping ..." + source_port + " and " + source_host };
//    }, 1000);

    function do_handshake(data) {
        var i, idx, dlen = data.length, lines, location, rheaders,
            sec_hdr;
        //console.log("received handshake data: " + data);
        handshake += data.toString('utf8');
        if ((data[dlen-12] != 13) ||
            (data[dlen-11] != 10) ||
            (data[dlen-10] != 13) ||
            (data[dlen-9] != 10)) {
            //sys.log("Got partial handshake");
            return;
        }
        //sys.log("Got whole handshake");

        if (handshake.indexOf('GET ') != 0) {
            sys.error("Got invalid handshake");
            client.end();
            return;
        }

        lines = handshake.split('\r\n');
        path = lines[0].split(' ')[1];
        //console.log("path: " + path);

        k3 = data.slice(dlen-8, dlen);
        for (i = 1; i < lines.length; i++) {
            //console.log("lines[i]: " + lines[i]);
            if (lines[i].length == 0) { break; }
            idx = lines[i].indexOf(': ');
            if (idx < 0) {
                sys.error("Got invalid handshake header");
                client.end();
                return;
            }
            header = lines[i].slice(0, idx).toLowerCase();
            headers[header] = lines[i].slice(idx+2);
        }
        //console.dir(headers);
        //console.log("k3: " + k3 + ", k3.length: " + k3.length);

        if (headers.upgrade !== 'WebSocket') {
            sys.error("Upgrade header is not 'WebSocket'");
            client.end();
            return;
        }

        location = (headers.origin.substr(0, 5) == 'https' ? 'wss' : 'ws')
            + '://' + headers.host + path;
        //console.log("location: " + location);
        

        if ('sec-websocket-key1' in headers) {
            version = 76;
            sec_hdr = "Sec-";
        } else {
            version = 75;
            sec_hdr = "";
        }
        //console.log("using protocol version " + version);

        rheaders = [
            'HTTP/1.1 101 WebSocket Protocol Handshake',
            'Upgrade: WebSocket',
            'Connection: Upgrade',
            sec_hdr + 'WebSocket-Origin: ' + headers.origin,
            sec_hdr + 'WebSocket-Location: ' + location
        ];
        if ('sec-websocket-protocol' in headers) {
            rheaders.push('Sec-WebSocket-Protocol: ' + headers['sec-websocket-protocol']);
        }
        rheaders.push('');
        if (version === 76) {
            rheaders.push(gen_md5(headers, k3));
        }
        //console.log("I am here after 76 check");

        // Switch listener to normal data path
        client.on('data', client_data);
        //client.setEncoding('utf8');
        client.removeListener('data', do_handshake);
        // Do not delay writes
        client.setNoDelay(true);

        // Send the handshake response
        try {
            //sys.log("response: " + rheaders.join('\r\n'));
            //console.log("Before Write.");
            client.write(rheaders.join('\r\n'), 'binary');
        } catch(e) {
            console.log("Failed to send handshake response");
            client.end();
            return;
        }

        // Create a connection to the target
        target = net.createConnection(target_port, target_host);
        target.on('data', target_data);
        target.on('end', function () {
            console.log("received target end");
            cleanup();
        });
        target.on('error', function (exc) {
            console.log("received target error: " + exc);
            cleanup();
        });
    }

    function client_data(data) {
        var ret;
        //console.log("received client data: " + data);
        //sys.log("             decoded: " + decode(data));
        try {
            ret = target.write(decode(data), 'binary');
            if (! ret) {
                console.log("target write returned false*********************");
            }
        } catch(e) {
            console.log("fatal error writing to target**********************");
            cleanup();
        }
           // var f = subscription.get();
           // f.result = data;

    }

    function target_data(data) {
        //console.log("received target data: " + data);
        //sys.log("             encoded: " + encode(data));
        try {
            client.write(encode(data), 'binary');
        } catch(e) {
            console.log("fatal error writing to client**********************");
            cleanup();
        }

           // var f = subscription.get();
           // f.result = data;
    }

    client.on('connect', function () {
        console.log("Got client connection");
    });
    client.on('data', do_handshake);
    client.on('end', function () {
        console.log("recieved client end");
        cleanup();
    });
    client.on('error', function (exc) {
        console.log("recieved client error***********: " + exc);
        cleanup();
    });
});
















try {
    var idx;
    idx = source_arg.indexOf(":");
    if (idx >= 0) {
        source_host = source_arg.slice(0, idx);
        source_port = parseInt(source_arg.slice(idx+1), 10);
    } else {
        source_host = "";
        source_port = parseInt(source_arg, 10);
    }

    idx = target_arg.indexOf(":");
    if (idx < 0) {
        throw("target must be host:port");
    }
    target_host = target_arg.slice(0, idx);
    target_port = parseInt(target_arg.slice(idx+1), 10);

    if (isNaN(source_port) || isNaN(target_port)) {
        throw("illegal port");
    }
} catch(e) {
    console.error("wsproxy.py [source_addr:]source_port target_addr:target_port");
    process.exit(2);
}

console.log("source: " + source_host + ":" + source_port);
console.log("target: " + target_host + ":" + target_port);
//if(server.listen(source_port,source_host))
//server.close();
server.listen(source_port,source_host);








  //  future.result = {reply: source_port + " and " + source_host + " to " + target_host + " and " + target_port};

    this.interval = setInterval(function ping() {
        var f = subscription.get();
        f.result = { reply: "ping ..." + source_port + " and " + source_host };
    }, 10);






}

ProxyAssistant.prototype.cancelSubscription = function() {
    server.close();
            clearInterval(this.interval);
       }
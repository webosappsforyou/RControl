/*
 * noVNC: HTML5 VNC client
 * Copyright (C) 2011 Joel Martin
 * Licensed under LGPL-3 (see LICENSE.txt)
 *
 * See README.md for usage and integration instructions.
 */

//"use strict";
/*jslint white: false, browser: true */
/*global window, $D, Util, WebUtil, RFB, Display */


enyo.kind(
{
        name: "proxify",
        kind: "enyo.PalmService",
        service: "palm://com.palmdts.helloworld.service",
        method: 'hello',
        subscribe: true,
  onSuccess: "goodd",
  onFailure: "badd"
, 
/*{
  name: "proxify",
  kind: "PalmService",
  service: "palm://com.palmdts.helloworld.service",
  method: "hello",
  onSuccess: "goodd",
  onFailure: "badd"
}, */
goodd: function(){
console.log("WS-ed");
},
badd: function(){
console.log("WS- Failed");
}
});



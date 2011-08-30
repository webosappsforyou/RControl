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

var host, port, password;
var rfb;
var scrollx = 0;
var scrolly = 0;

function flushClient() {
    
    console.log("Legnth issssss : " + mouse_arr.length);
    if (mouse_arr.length > 0) {
        //send(mouse_arr.concat(fbUpdateRequest(1)));
        ws.send(mouse_arr);
        setTimeout(function() {
                ws.send(fbUpdateRequest(1));
            }, 50);

        mouse_arr = [];
        return true;
    } else {
        return false;
    }
}

function getxyshift() {

    //console.log(JSON.stringify(this.$.scroller.scrollTop));
    //console.log(JSON.stringify(this.$.scroller.scrollLeft));
    //var test = scroller;
    //console.log(App.$.scroller);
    //console.log(test.scrollTop);
    return {'x': scrollx/6, 'y': scrolly/6};

}

enyo.kind(
{	name: "App",
	kind: enyo.VFlexBox,
	components: [
        {kind: "Control", name:"LoginPanel", layoutKind: "HFlexLayout",
            pack: "left", align: "start",style:" z-index: 100;", components: [
                {name: "VNC_host",kind: "Input",hint:"ipaddress",style:"font-size:12px;width:175px",onfocus:"checkkb"}, 
                {name: "VNC_port",kind: "Input",hint:"port",style:"font-size:12px;width:75px",onfocus:"checkkb",value:"5900"}, 
                {name: "VNC_password",kind: "PasswordInput",hint:"password",style:"font-size:12px;width:175px",onfocus:"checkkb"}, 
                {kind: "Button", caption: "Login", style:"font-size:12px;", onclick: "connect"}, //,
//END Of HFlex Components 
        ]},
        {kind: "Control", name:"KBPanel",showing:false, layoutKind: "HFlexLayout",
            pack: "left", align: "start",style:" z-index: 100;", components: [
                {kind: "Button", caption: "Disconnect", style:"font-size:12px;",onclick: "disconnect"},
                {kind: "Button", caption: "Keyboard", style:"font-size:12px;",onclick: "keyboard"}, //,
                {kind: "Button", caption: "Ctrl-Alt-Del", style:"font-size:12px;",onclick: "CtlAltDel"}, //,
               // {kind: "Button", caption: "Ctrl", style:"font-size:12px;",onclick: "Ctrl"}, //,
                {kind: "Button", caption: "Alt", style:"font-size:12px;",onclick: "Alt"}, //,
                {kind: "Button", caption: "Esc", style:"font-size:12px;",onclick: "Esc"}, //,
                {kind: "Button", caption: "PgUp", style:"font-size:12px;",onclick: "pageup"}, //,
                {kind: "Button", caption: "PgDn", style:"font-size:12px;",onclick: "pagedown"}, //,0xFF0D
                {kind: "Button", caption: "Enter", style:"font-size:12px;",onclick: "Enter"}, //,
                {kind: "Spacer"},
                {kind:"ToolButton",name:"LButton", icon:"images/mouseleft.png", style:"height:32px;width:32px",onclick: "lbutton" }, 
                {kind:"ToolButton",name:"RButton", icon:"images/mouseright.png",style:"height:32px;width:32px",onclick: "rbutton"}, 
                {kind: "Spacer"},
                {kind: "enyo.HFlexBox",style: "align:right",components:[
/* Commenting left and right buttons.*/
                {kind:"ToolButtonGroup",components: [
                    {icon:"images/menu-icon-back.png",onclick: "leftmove"}, //style:"height:19px;width:19px",style:"height:32px;width:32px",
                ]},
                {kind:"ToolButtonGroup",components: [
                    {icon:"images/menu-icon-forward.png",onclick: "rightmove"},
                ]},
               
         //   ]},
         //   {kind: "enyo.VFlexBox",components:[
                {kind:"ToolButtonGroup",components: [
                    {icon:"images/menu-icon-up.png",onclick: "upmove"},
                ]},
                {kind:"ToolButtonGroup",components: [
                    {icon:"images/menu-icon-down.png",onclick: "downmove"}
                ]},
            ]},
/*Optional Section End*/            
//END Of HFlex Components 
        ]},
        {flex: 1, kind: "Scroller",name:"scroller",onScrollStop:"scrollxy", components: [
                {name: "HW",kind: enyo.htmlContent,style:"width:1024;height:700",
                content: " <div id=\"omw_scrollpane1\"> <canvas id=\"VNC_canvas\" width=\"1024px\" height=\"700px\"> </canvas> </div> "},
        ]},
	{kind: "AppMenu", components: [
			{kind: "EditMenu"} ,
			{caption: "Disconnect", onclick: "disconnect"}, 
			{caption: "About", onclick: "AboutClick"}, 
			{caption: "FAQs", onclick: "FAQClick"}, 
			//{caption: "Preferences", onclick: "menuitemclicked1"}, 
			{caption: "Help", onclick: "HelpClick"} 
	]},

    {name: "proxify",
        kind: enyo.PalmService,
        service: "palm://com.prenewbie.rcontrol.service",
        method: 'proxify',
        subscribe: true,
        onSuccess: "good",
        onFailure: "bad"
    },
    /* {
         name: "firewallopen",
         kind: "PalmService",
         service: "palm://com.palm.firewall/",
         method: "control",
       subscribe: true,
       onSuccess : "openPortSuccess",
       onFailure : "openPortFail"  ,     
       rules:[
      {"protocol":"TCP","destinationPort":5900},
      {"protocol":"UDP","destinationPort":5900}]
      }*/
    {name: "About", kind: "Popup", onCancel: "closePopupAbout", components: [
        {kind: enyo.HtmlContent, name:"AboutContent",style:"font-size:18px",content: "<h><u> Simple VNC App </u></h> <p>This is an app that can be used to access your remote computer right on your TouchPad. <br>For any help/ideas/suggestions, please click on help button in the menu. <br> Please check FAQs section before emailing suport. </p>"}, //,width: "300px", height: "75%", style: "font-size: 15px; padding: 6px;"
        {kind: "Spacer"},
        {kind: "Button", flex: 1, caption: "OK", onclick: "closePopupAbout"}
    ]},
    {name: "sendEmail", kind: "PalmService", service: "palm://com.palm.applicationManager/", method: "open", subscribe: false},
    {name: "BrowserApp", kind: enyo.PalmService, service: "palm://com.palm.applicationManager/",
          onSuccess: "",
          onFailure: "",
    },
    ],
	HelpClick: function() {
    
        this.emailsubject = "";
        this.$.sendEmail.call({
            id: 'com.palm.app.email',
            params: {
            summary: 'Help needed on VNC App',
            recipients: [{
                type: "email",
                role: 1,
                value: 'webosappsforyou@gmail.com',
                contactDisplay: 'VNC App Help' 
                }],
            text: this.emailsubject    
            }
        });        


	},
	AboutClick: function() {
        
        this.$.About.openAtCenter();


	},
	FAQClick: function() {
        
        
        //console.log(this.$.buylink);

        this.$.BrowserApp.call({id : 'com.palm.app.browser', params: {target: "http://rcontrolforwebos.blogspot.com/"}}, {method: "launch"});

	},
	closePopupAbout: function(inSender) {
        //console.log(inSender);
		this.$.About.close();
	},
    openPortSuccess:  function(inSender, inResponse){
    console.log("Port opened");
    },
    openPortFail:   function(inSender, inResponse){
    console.log("Port open failed : " + JSON.stringify(inResponse));
    console.log (JSON.stringify(inSender));
    },
    good: function(inSender, inResponse){
    
    //console.log("WS-ed" + JSON.stringify(inResponse));

//svsvsvsv

    if (rfb ) {
    //console.log("rfb already there.");
    
    }
    else {
    rfb = RFB({'target': $D('VNC_canvas'),
                  'onUpdateState': "updateState",
                  'onClipboard': "clipReceive"});

    rfb.set_encrypt("false"); //UI.getSetting('encrypt'));
    rfb.set_true_color("true"); //UI.getSetting('true_color'));
    rfb.set_local_cursor("false"); //UI.getSetting('cursor'));
    rfb.set_shared("true"); //UI.getSetting('shared'));
    rfb.set_connectTimeout(2); //UI.getSetting('connectTimeout'));
   //sssssssssss
    rfb.connect(host, port, password);
    this.$.LoginPanel.setShowing(false);
    this.$.KBPanel.setShowing(true);

    }
    
    
//svsvsv

    },
    bad: function(inSender, inResponse){
        enyo.windows.addBannerMessage("Oops. Something's wrong with proxy settings.", "{}");
        console.log("WS- Failed" + JSON.stringify(inResponse));
    },
    connect: function() {
//    UI.closeSettingsMenu();

    host = this.$.VNC_host.getValue();
    port = this.$.VNC_port.getValue();
    password = this.$.VNC_password.getValue();
    console.log(host);
    console.log(port);
    //console.log(password);
    if ((!host) || (!port)) {
        throw("Must set host and port");
    }

   var hostport = host + ":" + port;
   var lhostport = "127.0.0.1:" + port; //"localhost:" + port;
    // Shylendra
    host = "127.0.0.1"; //"localhost";

//svsvsv   for safari testing

/*
    rfb = RFB({'target': $D('VNC_canvas'),
                  'onUpdateState': "updateState",
                  'onClipboard': "clipReceive"});

    rfb.set_encrypt("false"); //UI.getSetting('encrypt'));
    rfb.set_true_color("true"); //UI.getSetting('true_color'));
    rfb.set_local_cursor("false"); //UI.getSetting('cursor'));
    rfb.set_shared("true"); //UI.getSetting('shared'));
    rfb.set_connectTimeout(2); //UI.getSetting('connectTimeout'));
    rfb.connect(host, port, password);
*/
// Uncomment this line below for touchpad.
    this.$.proxify.subscribe = false;
    this.$.proxify.subscribe = true;
    this.$.proxify.call({sarg: lhostport,targ:hostport});
    rfb=null;
   console.log("proxify done");




    },
    clipReceive: function(rfb, text) {
    Util.Debug(">> UI.clipReceive: " + text.substr(0,40) + "...");
    $D('VNC_clipboard_text').value = text;
    Util.Debug("<< UI.clipReceive");
    },
    disconnect: function() {
    //closeSettingsMenu();

    this.$.proxify.subscribe = false;
    //this.$.proxify.subscribe = true;
    rfb.disconnect();
    this.$.proxify.cancel();
    this.$.proxify.cancelCall();
    this.$.KBPanel.setShowing(false);
    this.$.LoginPanel.setShowing(true);
    //this.$.proxify.destroy();

    },
    keyboard: function() {
    if(enyo.keyboard.isShowing() == true)
    enyo.keyboard.forceHide();
    else
    enyo.keyboard.forceShow(0);
    },
    Ctrl: function() {
    /*if(kbstatus == 1) {
        
        keyboard.ungrab();
        kbstatus = 0;
    
    }
    else {
    */
        rfb.sendCtrl();
    /*    keyboard.grab();
        
    }*/
    },
    Enter: function() {
    rfb.sendEnter();
    },
    Alt: function() {
    rfb.sendAlt();
    },
    Esc: function() {
    rfb.sendEsc();
    },
    CtlAltDel: function() {
    rfb.sendCtrlAltDel();
    },
    checkkb: function() {
    if (enyo.keyboard.isManualMode() == true) 
    enyo.keyboard.setManualMode(false);
    },
    rightclick: function() {

    console.log(mouse);
    mouse.onMouseDown1();
    mouse.onMouseUp1();

    },
    leftmove: function() {

    //console.log("BOUNDARIESSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS");
    //console.log(JSON.stringify(this.$.scroller.getBoundaries()));
    scrollx +=20;
    this.$.scroller.scrollTo(scrolly,scrollx);
    console.log("calling left moveeeee");


    },
    rightmove: function() {

    //console.log("BOUNDARIESSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS");
    //console.log(JSON.stringify(this.$.scroller.getBoundaries()));
    scrollx -=20;
    if(scrollx < 0) 
      scrollx=0;
      
    this.$.scroller.scrollTo(scrolly,scrollx);

    },
    upmove: function() {


    //console.log("BOUNDARIESSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS");
    //console.log(JSON.stringify(this.$.scroller.getBoundaries()));
    scrolly +=20;
    this.$.scroller.scrollTo(scrolly,scrollx);
    //this.$.scroller.scrollIntoView(20,20);
    
    
    },
    downmove: function() {

    //console.log("BOUNDARIESSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS");
    //console.log(JSON.stringify(this.$.scroller.getBoundaries()));
    scrolly -=20;
    if(scrolly < 0) 
      scrolly =0;
      
    this.$.scroller.scrollTo(scrolly,scrollx);

    },
    pageup: function() {

        rfb.sendPageUp();

    },
    pagedown: function() {

        rfb.sendPageDown();
        
    },
    lbutton: function() {

    //console.log("BOUNDARIESSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS");
    //console.log(JSON.stringify(this.$.scroller.scrollTop));
    //console.log(JSON.stringify(this.$.scroller.scrollLeft));

        if (this.$.RButton.icon == "images/mouserightS.png") {
        
            this.$.RButton.setIcon("images/mouseright.png");
            //this.$.Esc();
            rfb.sendEsc();
            
            
        } 
            var b, blist = [1,2,4];
            var num = 1;
            if (typeof num === 'undefined') {
                // Show the default
                num = mouse.get_touchButton();
            } else if (num === mouse.get_touchButton()) {
                // Set all buttons off (no clicks)
                mouse.set_touchButton(0);
                num = 0;
            } else {
                // Turn on one button
                mouse.set_touchButton(num);
            }

    },
    rbutton: function() {

    //console.log("BOUNDARIESSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS");
    //console.log(JSON.stringify(this.$.scroller.scrollTop));
    //console.log(JSON.stringify(this.$.scroller.scrollLeft));
        //rfb.sendPageDown();
        if (this.$.RButton.icon == "images/mouserightS.png") {
        
            this.lbutton();
            
        } 
        else {
            
            this.$.RButton.setIcon("images/mouserightS.png");
            var b, blist = [1,2,4];
            var num = 4;
            if (typeof num === 'undefined') {
                // Show the default
                num = mouse.get_touchButton();
            } else if (num === mouse.get_touchButton()) {
                // Set all buttons off (no clicks)
                mouse.set_touchButton(0);
                num = 0;
            } else {
                // Turn on one button
                mouse.set_touchButton(num);
            }
            
        }

    },
    scrollxy: function() {

        //rfb.sendPageDown();
        
    scrollx = this.$.scroller.scrollLeft;
    scrolly = this.$.scroller.scrollTop;


    },



});

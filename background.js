"use strict";
/**************************************************************************************
 * <copyright file="background.js" company="FullArmor Corp.">                         *
 *    Copyright (c) 2015 FullArmor Corporation.  All rights reserved.                 *
 * </copyright>                                                                       *
 *                                                                                    *
 **************************************************************************************/

// This JS file handles all of the background work for the HAPI Chrome Agent 
// it is what is launched when the APP is launched in Chrome OS
(function () {
    // create a new/single HAPIFSProvider object
    var adfs = new HAPIFSProvider();
    // create a function to show the configuration window if needed
    var openWindow = function() {
        chrome.app.window.create("popup.html", {
            outerBounds: {
                width: 800,
                height: 480
            },
            resizable: false
        });
    };
    // add openwindow to the onLaunched event for older chrome os versions
    chrome.app.runtime.onLaunched.addListener(openWindow);
    // if we have the onMountRequested event (newer chrome os version) add the openwindow handler
    if (chrome.fileSystemProvider.onMountRequested) {
      chrome.fileSystemProvider.onMountRequested.addListener(openWindow);
    }
    // if we have the onConfigureRequested event (newer chrome os version) add the openwindow handler
    if (chrome.fileSystemProvider.onConfigureRequested) {
      chrome.fileSystemProvider.onConfigureRequested.addListener(openWindow);
    }
    // add a handler for passing messages from the configuration screen back to the 
    // HAPIFSProvider object (messaging between the foreground and background)
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        switch(request.type) {
            case "login":
                console.log("Logging in...");
                adfs.login(request.gatekeeper, request.username, request.password, function(success, err) {
                    if (success) {
                        console.log("Logged In");
                        sendResponse({
                            type: "loggedin",
                            success: true
                        });
                    }
                    else {
                        console.log("Error logging in!");
                        adfs.unmountIfMounted();
                        sendResponse({
                            type: "error",
                            error: err
                        });
                    }
                });
                break;
            case "unmount":
                console.log("Unmounting if mounted");
                adfs.unmountIfMounted();
                sendResposne({ type: "unmounted" });
                break;
            case "logout":
                console.log("Logging out of HAPI");
                adfs.logout();
                sendResponse({ type: "loggedout" });
                break;
            case "isloggedin":
                console.log("Checking to see if we are logged in");
                if (adfs.hasClient() && adfs.isLoggedIn())
                {
                    console.log("Logged In");
                    sendResponse({ type: "loggedin" });
                }
                else {
                    console.log("Logged Out");
                    sendResponse({ type: "loggedout" });
                }
                break;
            case "getuserinfo":
                console.log("Getting user info");
                sendResponse({type: "info", gatekeeper: adfs.gatekeeper, user: adfs.user});
                break;
        }

        return true;
    });
})();
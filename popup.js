/**************************************************************************************
 * <copyright file="popup.js" company="FullArmor Corp.">                              *
 *    Copyright (c) 2015 FullArmor Corporation.  All rights reserved.                 *
 * </copyright>                                                                       *
 *                                                                                    *
 **************************************************************************************/
$(document).ready(function() {
  function setuserinfo(closeme) {
    var request = { type: "getuserinfo" };
    chrome.runtime.sendMessage(request, function(response) {
      $('#body').html("You are logged into<br><b>" + response.gatekeeper + "</b><br>as<br><b>" + response.user + "</b><br>");

    });
    
    $('#main').show();
    if (closeme) {
      window.close();
    }
  }
  
  document.getElementById('loginButton').addEventListener("click", function() {
    $('#error').html("")
    console.log("Logging in!");
    var request = {
      type: "login",
      gatekeeper: $('#gatekeeper').val(),
      username: $('#username').val(),
      password: $('#password').val()
    };
    
    chrome.runtime.sendMessage(request, function(response) {
      if (response.type == "error") {
        $('#error').html("<p>" + response.error + "</p>");
      }
      else {
        $('#login').hide();
        setuserinfo(true);
      }
    });
  });

  document.getElementById('logoutButton').addEventListener("click", function() {
     var request = { type: "logout" };
     chrome.runtime.sendMessage(request, function(response){
         console.log("Logged out!");
         $('#main').hide();
         $('#login').show();
     });
  });
  
  var request = { type: "isloggedin" };
  
  chrome.runtime.sendMessage(request, function(response) {
    if (response.type == "loggedin") {
      console.log("Logged In");
      $('#login').hide();
      setuserinfo(false);
    }
    else {
      console.log("Not logged in, show login form");
      $('#main').hide();
      $('#login').show();
    }
  });
  
  $('#password').keypress(function(e) {
    var key = e.which;
    if (key == 13) {
      $('#loginButton').click();
      return false;
    }
  });
});



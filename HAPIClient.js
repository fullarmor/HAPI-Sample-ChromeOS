"use strict";
/**************************************************************************************
 * <copyright file="HAPIClient.js" company="FullArmor Corp.">                         *
 *    Copyright (c) 2015 FullArmor Corporation.  All rights reserved.                 *
 * </copyright>                                                                       *
 *                                                                                    *
 **************************************************************************************/
(function () {
  /**
    * HAPIClient object
    * This is a javascript client used to communicate with a HAPI gatekeeper
    * @constructor
    */
  var HAPIClient = function (gatekeeper) {
      var _token, _usersid, _userdisplayname, _gatekeeper, _username, _password;
  
      this.CONST_ADSHARE_ROOTLEVEL_FOLDERENUMREQUEST = {FileIdentifier: "", Filters: [], MaxLevels: "0"};
      _gatekeeper = gatekeeper;
      /**
        * Send a login request to HAPI.
        * @param {string} username - The username.
        * @param {string} password - The password.
        * @param {function} success - Success callback.
        * @param {function} error - Error callback.
        */
      this.login = function (username, password, success, error) {
          _username = username;
          _password = password;
  
          var xhr = new XMLHttpRequest();
          xhr.open("POST", _gatekeeper + '/route/hapi/login', true);
          xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
          xhr.setRequestHeader('HAPIToken', _token);
          xhr.onload = function(e) {
              var data = JSON.parse(this.responseText);
              if (data.Success) {
                  _token = data.Token;
                  _usersid = data.UserSID;
                  _userdisplayname = data.UserDisplayName;
                  success();
              }
              else {
                  this.hapiToken = false;
                  error(data.Error);
              }
          };
          xhr.send(JSON.stringify({UserName: username, Password: password}));
      };
      /**
        * Do a call to GetFilesAndFolders based on path (gateway or agent)
        * @param {string} controller - The HAPI controller to connect to.
        * @param {string} folderEnumRequest - A HAPI FolderEnumRequest object.
        * @param {function} success - Success callback with results.
        * @param {function} error - Error callback.
        */
      this.getfilesandfolders = function (controller, folderEnumRequest, success, error) {
          var xhr = new XMLHttpRequest();
          if (controller.startsWith("agent")) {
              xhr.open("POST", _gatekeeper + '/route/' + controller + '/GetFilesAndFolders', true);
          }
          else {
              xhr.open("POST", _gatekeeper + '/route/hapi/' + controller + '/GetFilesAndFolders', true);
          }
          xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
          xhr.setRequestHeader('HAPIToken', _token);
          xhr.onload = (function (e) {
              if (this.status > 299) {
                  if (controller.startsWith("agent")) {
                    success({Items: []});
                  }
                  else {
                    error(this.status);
                  }
              }
              else
                  success(JSON.parse(this.responseText));
          });
          xhr.send(JSON.stringify(folderEnumRequest));
      };
      /**
        * Do a call to GetAllComputers against the Gatekeeper (gets all your agents)
        * @param {function} success - Success callback with results.
        * @param {function} error - Error callback.
        */
      this.getallcomputers = function (success, error) {
          var xhr = new XMLHttpRequest();
          xhr.open("POST", _gatekeeper + '/api/Configuration/GetAllComputers', true);
          xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
          xhr.setRequestHeader('HAPIToken', _token);
          xhr.onload = (function (e) {
              if (this.status > 299) {
                  error(this.status);
              }
              else
                  success(JSON.parse(this.responseText));
          });
          xhr.send(JSON.stringify({FileIdentifier: "", Filters: [{FilterTypeInt: "12", FilterOperationInt: "3", FilterValueTypeInt: "2", FilterValue: ""}]}));
      };
      /**
        * Do a call to Dowload based on path (gateway or agent) to download a file
        * Supports Range functionality
        * @param {string} controller - The HAPI controller to connect to.
        * @param {string} path - The path to the file to download.
        * @param {int} start - The byte to start reading at.
        * @param {int} stop - The byte to stop reading at.
        * @param {function} success - Success callback with results.
        * @param {function} error - Error callback.
        */
      this.downloadfile = function(controller, path, start, end, success, error) {
          var xhr = new XMLHttpRequest();
          if (controller.startsWith("agent")) {
              xhr.open("GET", _gatekeeper + '/route/' + controller + '/Download?fileIdentifier=' + path, true);
          }
          else {
              xhr.open("GET", _gatekeeper + '/route/hapi/' + controller + '/Download?fileIdentifier=' + path, true);
          }
          xhr.responseType = 'arraybuffer';
          xhr.setRequestHeader('HAPIToken', _token);
          xhr.setRequestHeader('Range', 'bytes=' + start + '-' + end);
          xhr.onload = (function (e) {
              if (this.status > 299) {
                  error(this.status);
              }
              else
                  success(this.response);
          });
          xhr.send();
      };
      /**
        * This is a special function since HAPI doesn't a specific truncate function,
        * however upload file does allow us to truncate a file
        * @param {string} controller - The HAPI controller to connect to.
        * @param {string} path - The path to the file to truncate.
        * @param {string} name - The name of the file.
        * @param {int} length - The new file length.
        * @param {function} success - Success callback with results.
        * @param {function} error - Error callback.
        */
      this.truncateFile = function(controller, path, name, length, success, error) {
          var xhr = new XMLHttpRequest();
          if (controller.startsWith("agent")) {
              xhr.open("POST", _gatekeeper + '/route/' + controller + '/UploadFile', true);
          }
          else {
              xhr.open("POST", _gatekeeper + '/route/hapi/' + controller + '/UploadFile', true);
          }
          var slice = new Blob([""]);
          
          var headers = {
              "HAPIToken": _token,
              "Accept": "application/json",
              "Cache-Control": "no-cache",
              "X-Requested-With": "XMLHttpRequest"
          };
          
          for (var headerName in headers) {
              var headerValue = headers[headerName];
              xhr.setRequestHeader(headerName, headerValue);
          }
          
          xhr.onload = (function (e) {
              if (this.status > 299) {
                  error(this.status);
              }
              else
                  success(this.response);
          });
          
          var form = new FormData();
          form.append("fileidentifier", path);
          form.append("chunk", -1);
          form.append("totalLength", length);
          form.append("truncate", true);
          form.append("file", slice, name);
          
          xhr.send(form);
      };
      /**
        * Do a call to UploadFile based on path (gateway or agent) to upload a file
        * Supports chunked uploads
        * @param {string} controller - The HAPI controller to connect to.
        * @param {string} path - The path to the file to upload.
        * @param {string} name - The name of the file uploading.
        * @param {int} offset - The byte to start writing at.
        * @param {byte[]} arrayBuffer - The bytes to write
        * @param {function} success - Success callback with results.
        * @param {function} error - Error callback.
        */
      this.uploadfile = function(controller, path, name, offset, arraybuffer, success, error) {
          var xhr = new XMLHttpRequest();
          var slice = new Blob([arraybuffer]);
          if (controller.startsWith("agent")) {
              xhr.open("POST", _gatekeeper + '/route/' + controller + '/UploadFile', true);
          }
          else {
              xhr.open("POST", _gatekeeper + '/route/hapi/' + controller + '/UploadFile', true);
          }          

          var headers = {
              "HAPIToken": _token,
              "Accept": "application/json",
              "Cache-Control": "no-cache",
              "X-Requested-With": "XMLHttpRequest"
          };
          
          for (var headerName in headers) {
              var headerValue = headers[headerName];
              xhr.setRequestHeader(headerName, headerValue);
          }
          
          xhr.onload = (function (e) {
              if (this.status > 299) {
                  error(this.status);
              }
              else
                  success(this.response);
          });
          
          var form = new FormData();
          form.append("fileidentifier", path);
          form.append("chunk", -1);
          form.append("chunkStart", offset);
          form.append("file", slice, name);
          
          xhr.send(form);
               
      };
      /**
        * Do a call to Delete based on path (gateway or agent)
        * @param {string} controller - The HAPI controller to connect to.
        * @param {string} path - The path to delete.
        * @param {function} success - Success callback with results.
        * @param {function} error - Error callback.
        */
      this.delete = function(controller, path, success, error) {
          var xhr = new XMLHttpRequest();
          if (controller.startsWith("agent")) {
              xhr.open("POST", _gatekeeper + '/route/' + controller + '/DeleteFiles', true);
          }
          else {
              xhr.open("POST", _gatekeeper + '/route/hapi/' + controller + '/DeleteFiles', true);
          } 
          xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
          xhr.setRequestHeader('HAPIToken', _token);
          xhr.onload = (function (e) {
              if (this.status > 299) {
                  error(this.status);
              }
              else
                  success(this.response);
          });
          xhr.send(JSON.stringify({FileIdentifiers: [path]}));
      };
      /**
        * Do a call to RenameFile based on path (gateway or agent)
        * @param {string} controller - The HAPI controller to connect to.
        * @param {string} source - The source file path.
        * @param {string} target - The target file path (name).
        * @param {function} success - Success callback with results.
        * @param {function} error - Error callback.
        */
      this.rename = function (controller, source, target, success, error) {
          var xhr = new XMLHttpRequest();
          if (controller.startsWith("agent")) {
              xhr.open("POST", _gatekeeper + '/route/' + controller + '/RenameFile', true);
          }
          else {
              xhr.open("POST", _gatekeeper + '/route/hapi/' + controller + '/RenameFile', true);
          } 
          xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
          xhr.setRequestHeader('HAPIToken', _token);
          xhr.onload = (function (e) {
              if (this.status > 299) {
                  error(this.status);
              }
              else
                  success(this.responseText);
          });
          xhr.send(JSON.stringify({FileIdentifier: source, NewName: target}));        
      };
      /**
        * Do a call to CopyFiles based on path (gateway or agent)
        * @param {string} controller - The HAPI controller to connect to.
        * @param {string} source - The source file/folder path.
        * @param {string} target - The target file/folder path.
        * @param {bool} isFolder - Is the source a folder.
        * @param {function} success - Success callback with results.
        * @param {function} error - Error callback.
        */
      this.copy = function (controller, source, target, isFolder, success, error) {
          var xhr = new XMLHttpRequest();
          if (controller.startsWith("agent")) {
              xhr.open("POST", _gatekeeper + '/route/' + controller + '/CopyFiles', true);
          }
          else {
              xhr.open("POST", _gatekeeper + '/route/hapi/' + controller + '/CopyFiles', true);
          } 
          xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
          xhr.setRequestHeader('HAPIToken', _token);
          xhr.onload = (function (e) {
              if (this.status > 299) {
                  error(this.status);
              }
              else
                  success();
          });
          
          var targetProvider = controller;
          
          if (targetProvider == "share") {
              targetProvider = "AD";
          }
          
          var cfr = {};
          var sf = {};
          sf.FileIdentifier = source;
          sf.TargetFileName = target.substring(target.lastIndexOf('\\') + 1);
          sf.IsFolder = isFolder;
          cfr.SourceFiles = [sf];
          cfr.TargetProvider = controller;
          cfr.TargetFolderIdentifier = target.substring(0, target.lastIndexOf('\\'));
          cfr.CollisionHandling = "Overwrite";
          cfr.Interval = "5";
          cfr.IntervalUnit = "1";
          cfr.IsOneTime = "True";
          cfr.NextRunTime = null;
          
          xhr.send(JSON.stringify(cfr));         
      };
  };
  
  window.HAPIClient = HAPIClient;
})();
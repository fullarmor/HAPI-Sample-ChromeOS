"use strict";
/**************************************************************************************
 * <copyright file="HAPIFSProvider.js" company="FullArmor Corp.">                     *
 *    Copyright (c) 2015 FullArmor Corporation.  All rights reserved.                 *
 * </copyright>                                                                       *
 *                                                                                    *
 **************************************************************************************/
(function () {
    /**
      * HAPIFSProvider object
      * This is object implements the Chrome FileSystem Provider for HAPI
      * @constructor
      * @param {string} gatekeeper - Full URL to the gatekeeper.
      * @param {string} username - The Active Directory domain and username (domain\user).
      * @param {string} password - The Active Directory password for the domain\username.
      */
    var HAPIFSProvider = function (gatekeeper, username, password) {
        // reset everything
        console.log("HAPIFSProvider.(Constructor) - {\"gatekeeper\":\"" + gatekeeper + "\", \"username\":\"" + username + "\", \"password\":\"********\"}");
        this.retries = 0;
        this.fileSystemId = 'fullarmor_hapi';
        this.assigendEventHandlers = false;
        this.fileCache = new FSPCache();
        this.hapiClient = {};
        this.requests = {};
        this.openFiles = {};
        this.gatekeeper = "";
        this.user = "";
        this.loggedin = false;
        this.reset();
        // if we are all reset, look to see if everything we need is in local storage
        // if so, login, if not we'll need to ask for it
        // if form post, they were add during construction, so just log in
        if (isNullOrEmpty(gatekeeper) || isNullOrEmpty(username) || isNullOrEmpty(password)) {
            console.log("HAPIFSProvider.(Constructor) - try local storage");
            chrome.storage.local.get(['hapifsgatekeeper', 'hapifsuser', 'hapifspass'], (function (items) {
                console.log("HAPIFSProvider.(Constructor).localStorage - " + JSON.stringify(items));
                if (!isNullOrEmpty(items.hapifsgatekeeper) && !isNullOrEmpty(items.hapifsuser) && !isNullOrEmpty(items.hapifspass)) {
                    this.login(items.hapifsgatekeeper, items.hapifsuser, items.hapifspass);
                }
            }).bind(this));
        }
        else {
            console.log("HAPIFSProvider.(Constructor) - login");
            this.login(gatekeeper, username, password);
        }
    };

    // Extensions
    /**
      * Helper extension to add a replaceAll feature to strings
      * @param {string} target - What should we replace.
      * @param {string} replacement - Replace it with this.
      */
    String.prototype.replaceAll = function (target, replacement) {
        return this.split(target).join(replacement);
    };

    // Public
    /**
      * Login to HAPI and set everything we need up
      * @param {string} gatekeeper - Full URL to the gatekeeper.
      * @param {string} username - The Active Directory domain and username (domain\user).
      * @param {string} password - The Active Directory password for the domain\username.
      * @param {function} callback - Callback function, returns true/false if login was successful.
      */
    HAPIFSProvider.prototype.login = function (gatekeeper, username, password, callback) {
        console.log("HAPIFSProvider.login - {\"gatekeeper\":\"" + gatekeeper + "\", \"username\":\"" + username + "\", \"password\":\"********\"}");
        this.hapiClient = new HAPIClient(gatekeeper);
        this.hapiClient.login(username, password, (function () {
            this.gatekeeper = gatekeeper;
            this.user = username;
            chrome.storage.local.set({ hapifsgatekeeper: gatekeeper, hapifsuser: username, hapifspass: password }, (function () {
                assignEventHandlers.call(this);
                this.mountIfNotMounted();
            }).bind(this));
            this.loggedin = true;
            sendCallback.call(this, null, callback, true);
        }).bind(this), (function (err) {
            this.loggedin = false;
            this.unmountIfMounted();
            this.hapiClient = null;
            sendCallback.call(this, null, callback, false, err);
        }).bind(this));
    };
    /**
      * Reset everything, except keep login information in local storage
      */
    HAPIFSProvider.prototype.reset = function () {
        console.log("HAPIFSProvider.logout - " + JSON.stringify(arguments));
        this.fileCache.remove("/", true)
        this.loggedin = false;
        this.unmountIfMounted();
        this.hapiClient = null;
    };
    /**
      * Logs out of HAPI.  Resets everything and removes all information for local storage
      */
    HAPIFSProvider.prototype.logout = function () {
        this.reset();
        chrome.storage.local.remove(['hapifsgatekeeper', 'hapiuser', 'hapipass']);
    };
    /**
      * Function returns true/false depending on if the HAPI Client object is setup or not
      */
    HAPIFSProvider.prototype.hasClient = function () {
        console.log("HAPIFSProvider.hasClient - " + JSON.stringify(arguments));
        if (isNullOrEmpty(this.hapiClient))
            return false;
        else
            return true;
    };
    /**
      * Function returns true/false depending on if the isLoggedIn flag is set
      */
    HAPIFSProvider.prototype.isLoggedIn = function () {
        return this.loggedin;
    };
    /**
      * Chrome FileSystem Provider onUnmountRequested Handler
      * @param {object} options - Options input.
      * @param {function} success - Success callback.
      * @param {function} error - Error callback.
      */
    HAPIFSProvider.prototype.onUnmountRequested = function (options, success, error) {
        console.log("HAPIFSProvider.onUnmountRequested - " + JSON.stringify(arguments));
        this.requests[options.requestId] = true;
        this.reset();

        sendCallback.call(this, options.requestId, success);
    };
    /**
      * Chrome FileSystem Provider onGetMetadataRequested Handler
      * @param {object} options - Options input.
      * @param {function} success - Success callback.
      * @param {function} error - Error callback.
      */
    HAPIFSProvider.prototype.onGetMetadataRequested = function (options, success, error) {
        console.log("HAPIFSProvider.onGetMetadataRequested - " + JSON.stringify(arguments));
        this.requests[options.requestId] = true;
        var fileInfo = this.getFileInfoFromPath(options.entryPath);
        var fileIdentifier = fileInfo.fileIdentifier;
        if (options.fileSystemId == this.fileSystemId) {
            var now = new Date();
            if (options.entryPath == '/') {
                sendCallback.call(this, options.requestId, success, { isDirectory: true, name: "", size: 0, modificationTime: now });
            }
            else if (options.entryPath == '/shares') {
                sendCallback.call(this, options.requestId, success, { isDirectory: true, name: "shares", size: 0, modificationTime: now });
            }
            else if (options.entryPath == '/computers') {
                sendCallback.call(this, options.requestId, success, { isDirectory: true, name: "computers", size: 0, modificationTime: now });
            }
            else {
                if (this.fileCache.get(options.entryPath)) {
                    var entry = this.fileCache.get(options.entryPath);
                    if (entry) {
                        if (!isNullOrEmpty(entry['newfile'])) {
                            getFilesAndFolders.call(this, options.entryPath.substring(0, options.entryPath.lastIndexOf('/')), fileIdentifier, (function (entries) {
                                entry = this.fileCache.get(options.entryPath);
                                if (entry) {
                                    console.log("Entry (newfile): " + JSON.stringify(entry));
                                    sendCallback.call(this, options.requestId, success, entry);
                                }
                                else {
                                    sendCallback.call(this, options.requestId, error, "NOT_FOUND");
                                }
                            }).bind(this), (function () { clientFailure.call(this, options.requestId, error, "NOT_FOUND"); }).bind(this));
                        }
                        else {
                            console.log("Entry (cached): " + JSON.stringify(entry));
                            sendCallback.call(this, options.requestId, success, entry);
                        }
                    }
                    else {
                        sendCallback.call(this, options.requestId, error, "NOT_FOUND");
                    }
                }
                else {
                    sendCallback.call(this, options.requestId, error, "NOT_FOUND");
                }
            }
        }
    };
    /**
      * Chrome FileSystem Provider onReadDirectoryReqeuested Handler
      * @param {object} options - Options input.
      * @param {function} success - Success callback.
      * @param {function} error - Error callback.
      */
    HAPIFSProvider.prototype.onReadDirectoryRequested = function (options, success, error) {
        console.log("HAPIFSProvider.onReadDirectoryRequested - " + JSON.stringify(arguments));
        this.requests[options.requestId] = true;
        if (isNullOrEmpty(this.hapiClient)) {
            console.log("HAPI client is not initialized!");
            sendCallback.call(this, options.requestId, error, "FAILED");
        }
        else {
            if (options.fileSystemId == this.fileSystemId) {
                if (this.fileCache.get(options.directoryPath) && this.fileCache.get(options.directoryPath).fileIdentifier) {
                    var fileIdentifier = this.fileCache.get(options.directoryPath).fileIdentifier;
                    getFilesAndFolders.call(this, options.directoryPath, fileIdentifier, (function (entries) {
                        sendCallback.call(this, options.requestId, success, entries, false);
                    }).bind(this), (function () { clientFailure.call(this, options.requestId, error, "NOT_FOUND"); }).bind(this));
                }
                else {
                    // do a recursive readDirectory to fill in the missing cache data
                    this.recursiveReadDirectory(options.directoryPath, (function (entries) {
                        sendCallback.call(this, options.requestId, success, entries, false);
                    }).bind(this), (function () { clientFailure.call(this, options.requestId, error, "NOT_FOUND"); }).bind(this));
                }
            }
        }
    };
    /**
      * Chrome FileSystem Provider onOpenFileRequested Handler
      * @param {object} options - Options input.
      * @param {function} success - Success callback.
      * @param {function} error - Error callback.
      */
    HAPIFSProvider.prototype.onOpenFileRequested = function (options, success, error) {
        console.log("HAPIFSProvider.onOpenFileRequested - " + JSON.stringify(arguments));
        this.requests[options.requestId] = true;
        if (this.openFiles[options['filePath']]) {
            sendCallback.call(this, options.requestId, error, "IN_USE");
        }
        else {
            if (this.fileCache.get(options.filePath)) {
                var entry = this.fileCache.get(options.filePath);
                if (entry) {
                    var request = { filePath: options['filePath'], mode: options['mode'], size: entry.size };
                    this.requests[options['requestId']] = request;
                    this.openFiles[options['filePath']] = true;
                    success();
                }
                else {
                    sendCallback.call(this, options.requestId, error, "NOT_FOUND");
                }
            }
            else {
                sendCallback.call(this, options.requestId, error, "NOT_FOUND");
            }
        }
    };
    /**
      * Chrome FileSystem Provider onCloseFileRequested Handler
      * @param {object} options - Options input.
      * @param {function} success - Success callback.
      * @param {function} error - Error callback.
      */
    HAPIFSProvider.prototype.onCloseFileRequested = function (options, success, error) {
        console.log("HAPIFSProvider.onCloseFileRequested - " + JSON.stringify(arguments));
        this.requests[options.requestId] = true;
        var openRequest = this.requests[options['openRequestId']];
        this.openFiles[openRequest.filePath] = false;
        delete this.requests[options['openRequestId']];
        sendCallback.call(this, options.requestId, success);
    };
    /**
      * Chrome FileSystem Provider onReadFileRequested Handler
      * @param {object} options - Options input.
      * @param {function} success - Success callback.
      * @param {function} error - Error callback.
      */
    HAPIFSProvider.prototype.onReadFileRequested = function (options, success, error) {
        console.log("HAPIFSProvider.onReadFileRequested - " + JSON.stringify(arguments));
        this.requests[options.requestId] = true;
        if (isNullOrEmpty(this.hapiClient)) {
            console.log("HAPI client is not initialized!");
            sendCallback.call(this, options.requestId, error, "FAILED");
        }
        else {
            var controller = "share";
            var fileInfo = this.getFileInfoFromPath(this.requests[options['openRequestId']].filePath);
            var path = fileInfo.fileIdentifier;
            controller = fileInfo.controller;

            var size = this.requests[options['openRequestId']].size;
            var start = options['offset'];
            var end = start + options['length'];

            console.log("Start: " + start + ", End: " + end + ", Size: " + size);

            if (end < size)
                end = end - 1;
            else
                end = size;

            console.log("Start: " + start + ", End: " + end + ", Size: " + size);

            if (start >= size) {
                console.log("Reached end of file");
                sendCallback.call(this, options.requestId, success, new ArrayBuffer(0), false);
            }
            else {
                this.hapiClient.downloadfile(controller, path, start, end, (function (data) {
                    if (data === null) {
                        console.log("HAPIFSProvider.onReadFileRequested.hapiClient.downloadFile - failed, no data");
                        sendCallback.call(this, options.requestId, error, "FAILED");
                    }
                    else {
                        console.log("HAPIFSProvider.onReadFileRequested.hapiClient.downloadFile - " + JSON.stringify({ controller: 'share', path: path, start: start, end: end }));
                        console.log("Data Length: " + data.byteLength);
                        sendCallback.call(this, options.requestId, success, data, false);
                    }
                }).bind(this), (function () { clientFailure.call(this, options.requestId, error, "NOT_FOUND"); }).bind(this));
            }
        }
    };
    /**
      * Chrome FileSystem Provider onCreateDirectoryRequested Handler
      * @param {object} options - Options input.
      * @param {function} success - Success callback.
      * @param {function} error - Error callback.
      */
    HAPIFSProvider.prototype.onCreateDirectoryRequested = function (options, success, error) {
        console.log("HAPIFSProvider.onCreateDirectoryRequested - " + JSON.stringify(arguments));
        this.requests[options.requestId] = true;
        var agent = false;
        var controller = "share";
        var fileInfo = this.getFileInfoFromPath(options.directoryPath);
        var fileIdentifier = fileInfo.fileIdentifier;
        agent = fileInfo.agent;
        controller = fileInfo.controller;

        if (controller) {
            sendCallback.call(this, options.requestId, error, "EXISTS");
        }
        else {
            var parentInfo = this.getFileInfoFromPath(options.directoryPath.substring(0, options.directoryPath.lastIndexOf("/")));
            agent = parentInfo.agent;
            controller = parentInfo.controller;

            if (!controller) {
                sendCallback.call(this, options.requestId, error, "FAILED");
            }
            else {
                fileIdentifier = parentInfo.fileIdentifier + options.directoryPath.substring(options.directoryPath.lastIndexOf("/"));
                console.log("File Identifier: " + fileIdentifier);
                var buffer = new ArrayBuffer(10);
                this.hapiClient.uploadfile(controller, fileIdentifier, "hapi.txt", buffer, "Overwrite", (function () {
                    var removepath = fileIdentifier + "/hapi.txt";
                    this.hapiClient.delete(controller, removepath, (function (data) {
                        var now = new Date();
                        this.fileCache.set(options.directoryPath, { fileIdentifier: fileIdentifier, isDirectory: true, size: 0, name: options.directoryPath.substring(options.directoryPath.lastIndexOf('/') + 1), modificationTime: now });
                        sendCallback.call(this, options.requestId, success, data, false);
                    }).bind(this), (function (err) {
                        if (err == "403")
                            sendCallback.call(this, options.requestId, error, "ACCESS_DENIED");
                        else
                            clientFailure.call(this, options.requestId, error, "NOT_FOUND");
                    }).bind(this));
                }).bind(this), (function () { clientFailure.call(this, options.requestId, error, "FAILED"); }).bind(this));
            }
        }
    };
    /**
      * Chrome FileSystem Provider onDeleteEntryRequested Handler
      * @param {object} options - Options input.
      * @param {function} success - Success callback.
      * @param {function} error - Error callback.
      */
    HAPIFSProvider.prototype.onDeleteEntryRequested = function (options, success, error) {
        console.log("HAPIFSProvider.onDeleteEntryRequested - " + JSON.stringify(arguments));
        this.requests[options.requestId] = true;

        if (isAboveShareLevel("share", options.entryPath)) {
            var controller = "share";
            var fileInfo = this.getFileInfoFromPath(options.entryPath);
            var fileIdentifier = fileInfo.fileIdentifier;
            controller = fileInfo.controller;

            if (!controller) {
                sendCallback.call(this, options.requestId, success, null, false);
            }
            else {
                this.hapiClient.delete(controller, fileIdentifier, (function (data) {
                    this.fileCache.remove(options.entryPath);
                    sendCallback.call(this, options.requestId, success, data, false);
                }).bind(this), (function (err) {
                    if (err == "403")
                        sendCallback.call(this, options.requestId, error, "ACCESS_DENIED");
                    else
                        clientFailure.call(this, options.requestId, error, "NOT_FOUND");
                }).bind(this));
            }
        }
        else {
            console.log("This is at share level, deny delete");
            sendCallback.call(this, options.requestId, error, "ACCESS_DENIED");
        }
    };
    /**
      * Chrome FileSystem Provider onCreateFileRequested Handler
      * @param {object} options - Options input.
      * @param {function} success - Success callback.
      * @param {function} error - Error callback.
      */
    HAPIFSProvider.prototype.onCreateFileRequested = function (options, success, error) {
        console.log("HAPIFSProvider.onCreateFileRequested - " + JSON.stringify(arguments));
        this.requests[options.requestId] = true;
        if (this.fileCache.get(options.filePath)) {
            sendCallback.call(this, options.requestId, error, "EXISTS");
        }
        else {
            var now = new Date();
            this.fileCache.set(options.filePath, { isDirectory: false, size: 0, name: options.filePath.substring(options.filePath.lastIndexOf('/') + 1), modificationTime: now, newfile: true });
            sendCallback.call(this, options.requestId, success);
        }
    };
    /**
      * Chrome FileSystem Provider onCopyEntryRequested Handler
      * @param {object} options - Options input.
      * @param {function} success - Success callback.
      * @param {function} error - Error callback.
      */
    HAPIFSProvider.prototype.onCopyEntryRequested = function (options, success, error) {
        console.log("HAPIFSProvider.onCopyEntryRequested - " + JSON.stringify(arguments));
        this.requests[options.requestId] = true;
        console.log("Copy " + options.sourcePath + " to " + options.targetPath);
        var controller = "share";
        var source = this.getFileInfoFromPath(options.sourcePath);
        var sourceFileIdentifier = source.fileIdentifier;
        controller = source.controller;
        var target = this.getFileInfoFromPath(options.targetPath.substring(0, options.targetPath.lastIndexOf("/")));
        var targetFileIdentifier = target.fileIdentifier + options.targetPath.substring(options.targetPath.lastIndexOf("/"));
        var isFolder = this.fileCache.get(options.sourcePath).isDirectory;
        if (isAboveShareLevel("share", options.targetPath)) {
            this.hapiClient.copy(controller, sourceFileIdentifier, targetFileIdentifier, isFolder, (function (data) {
                sendCallback.call(this, options.requestId, success);
            }).bind(this), (function (err) {
                if (err == "403")
                    sendCallback.call(this, options.requestId, error, "ACCESS_DENIED");
                else
                    clientFailure.call(this, options.requestId, error, "NOT_FOUND");
            }).bind(this));
        }
        else {
            console.log("This is at share level, deny copy");
            sendCallback.call(this, options.requestId, error, "ACCESS_DENIED");
        }
    };
    /**
      * Chrome FileSystem Provider onMoveEntryRequested Handler
      * @param {object} options - Options input.
      * @param {function} success - Success callback.
      * @param {function} error - Error callback.
      */
    HAPIFSProvider.prototype.onMoveEntryRequested = function (options, success, error) {
        console.log("HAPIFSProvider.onMoveEntryRequested - " + JSON.stringify(arguments));
        this.requests[options.requestId] = true;
        var controller = "share";
        var source = this.getFileInfoFromPath(options.sourcePath);
        var sourceFileIdentifier = source.fileIdentifier;
        controller = source.controller;
        var target = this.getFileInfoFromPath(options.targetPath.substring(0, options.targetPath.lastIndexOf("/")));
        var targetFileIdentifier = target.fileIdentifier + options.targetPath.substring(options.targetPath.lastIndexOf("/"));
        if (isAboveShareLevel("share", options.targetPath)) {
            this.hapiClient.rename(controller, sourceFileIdentifier, targetFileIdentifier, (function (data) {
                this.fileCache.remove(options.sourcePath);
                sendCallback.call(this, options.requestId, success);
            }).bind(this), (function (err) {
                if (err == "403")
                    sendCallback.call(this, options.requestId, error, "ACCESS_DENIED");
                else
                    clientFailure.call(this, options.requestId, error, "NOT_FOUND");
            }).bind(this));
        }
        else {
            console.log("This is at share level, deny move");
            sendCallback.call(this, options.requestId, error, "ACCESS_DENIED");
        }
    };
    /**
      * Chrome FileSystem Provider onTruncateRequested Handler
      * @param {object} options - Options input.
      * @param {function} success - Success callback.
      * @param {function} error - Error callback.
      */
    HAPIFSProvider.prototype.onTruncateRequested = function (options, success, error) {
        console.log("HAPIFSProvider.onTruncateRequested - " + JSON.stringify(arguments));
        this.requests[options.requestId] = true;
        if (isNullOrEmpty(this.hapiClient)) {
            console.log("HAPI client is not initialized!");
            sendCallback.call(this, options.requestId, error, "FAILED");
        }
        else {
            var path = options.filePath;
            var controller = "share";
            var fileInfo = this.getFileInfoFromPath(path.substring(0, path.lastIndexOf("/")));
            var fileIdentifier = fileInfo.fileIdentifier;
            controller = fileInfo.controller;
            var filename = path.substring(path.lastIndexOf('/') + 1);

            if (isAboveShareLevel("share", path)) {
                this.hapiClient.truncateFile(controller, fileIdentifier, filename, options['length'], (function () {
                    this.fileCache.remove(path);
                    getFilesAndFolders.call(this, path.substring(0, path.lastIndexOf('/')), fileIdentifier, (function (entries) {
                        sendCallback.call(this, options.requestId, success);
                    }).bind(this), (function () { clientFailure.call(this, options.requestId, error, "NOT_FOUND"); }).bind(this));
                }).bind(this), (function () { clientFailure.call(this, options.requestId, error, "FAILED"); }).bind(this));
            }
            else {
                console.log("This is at share level, deny truncate");
                sendCallback.call(this, options.requestId, error, "ACCESS_DENIED");
            }
        }
    };
    /**
      * Chrome FileSystem Provider onWriteFileRequested Handler
      * @param {object} options - Options input.
      * @param {function} success - Success callback.
      * @param {function} error - Error callback.
      */
    HAPIFSProvider.prototype.onWriteFileRequested = function (options, success, error) {
        console.log("HAPIFSProvider.onWriteFileRequested - " + JSON.stringify(arguments));
        this.requests[options.requestId] = true;
        if (isNullOrEmpty(this.hapiClient)) {
            console.log("HAPI client is not initialized!");
            sendCallback.call(this, options.requestId, error, "FAILED");
        }
        else {
            var path = this.requests[options['openRequestId']].filePath;
            var controller = "share";
            var fileInfo = this.getFileInfoFromPath(path.substring(0, path.lastIndexOf("/")));
            var fileIdentifier = fileInfo.fileIdentifier;
            controller = fileInfo.controller;
            var filename = path.substring(path.lastIndexOf('/') + 1);

            if (isAboveShareLevel("share", path)) {
                this.hapiClient.uploadfile(controller, fileIdentifier, filename, options.offset, options.data, (function () {
                    this.fileCache.remove(path);
                    getFilesAndFolders.call(this, path.substring(0, path.lastIndexOf('/')), fileIdentifier, (function (entries) {
                        sendCallback.call(this, options.requestId, success);
                    }).bind(this), (function () { clientFailure.call(this, options.requestId, error, "NOT_FOUND"); }).bind(this));
                }).bind(this), (function () { clientFailure.call(this, options.requestId, error, "FAILED"); }).bind(this));
            }
            else {
                console.log("This is at share level, deny write");
                sendCallback.call(this, options.requestId, error, "ACCESS_DENIED");
            }
        }
    };
    /**
      * Chrome FileSystem Provider onAbortRequested Handler
      * @param {object} options - Options input.
      * @param {function} success - Success callback.
      * @param {function} error - Error callback.
      */
    HAPIFSProvider.prototype.onAbortRequested = function (options, success, error) {
        console.log("HAPIFSProvider.onAbortRequested - " + JSON.stringify(arguments));
        console.log("Abort");
        if (this.requests[options.operationRequestId]) {
            delete this.requests[options.operationRequestId];
        }
        success();
    };
    /**
      * Helper function to check to see if the HAPI FS Provider is mapped or not, if so unmount it
      */
    HAPIFSProvider.prototype.unmountIfMounted = function () {
        console.log("HAPIFSProvider.unmountIfMounted - " + JSON.stringify(arguments));
        chrome.fileSystemProvider.getAll((function (fs) {
            var found = false;
            for (var i = 0; i < fs.length; i++) {
                if (fs[i].fileSystemId == this.fileSystemId)
                    found = true;
            }
            if (found)
                chrome.fileSystemProvider.unmount({ fileSystemId: this.fileSystemId });
        }).bind(this));
    };
    /**
      * Helper funcation to check to see if the HAPI FS Provider is mapped or not, if not mount it
      */
    HAPIFSProvider.prototype.mountIfNotMounted = function () {
        console.log("HAPIFSProvider.mountIfNotMounted - " + JSON.stringify(arguments));
        chrome.fileSystemProvider.getAll((function (fs) {
            var found = false;
            for (var i = 0; i < fs.length; i++) {
                if (fs[i].fileSystemId == this.fileSystemId)
                    found = true;
            }
            if (!found)
                chrome.fileSystemProvider.mount({ fileSystemId: this.fileSystemId, displayName: 'FullArmor HAPI', writable: true });
        }).bind(this));
    };
    /**
      * Helper function for the old method of getting a file identifier from the path.
      * @deprecated
      * @param {string} path - Path to the file/folder.
      */
    HAPIFSProvider.prototype.getFileIdentifierFromPath = function (path) {
        var parts = path.substring(1).split('/');
        var folders = [];
        var identifiers = [];
        for (var i = parts.length; i > 0; i--) {
            var minipath = '/' + parts.slice(0, i).join('/');
            if (this.fileCache.get(minipath)) {
                identifiers.unshift(parts[i - 1]);
            }
            else {
                folders.unshift(parts[i - 1]);
            }
        }
        var newpath = '\\\\';
        newpath += identifiers.join('\\');
        if (folders.length > 0)
            newpath += '/' + folders.join('/');

        return newpath;
    };
    /**
      * Helper function to get file info from the cache
      * @param {string} path - Path to the file or folder.
      */
    HAPIFSProvider.prototype.getFileInfoFromPath = function (path) {
        var file = this.fileCache.get(path);
        if (file) {
            return getFileInfoFromFileIdentifier(file.fileIdentifier);
        }
        else {
            return {
                agent: null,
                controller: null,
                fileIdentifier: null
            };
        }
    };
    /**
      * Helper function to fill in the cache with missing path parts
      * @param {string} directory - Path ensure we have all of the path parts in the cache
      * @param {function} success - Success callback.
      * @param {function} error - Error callback.
      */
    HAPIFSProvider.prototype.recursiveReadDirectory = function (directory, success, error) {
        var parts = directory.split('/');
        if (parts.length <= 2) {
            this.readDirectory(directory, success, error);
        } else {
            var tree = [];
            for (var i = 1; i < parts.length - 1; i++) {
                var path = "/" + parts.slice(1, i).join("/");
                tree.push(path);
            }
            var pos = 0;
            var loop = 0;
            while (pos < tree.length) {
                if (loop != pos) {
                    if (!this.fileCache.get(directoryPath)) {
                        this.readDirectory(tree[pos], function () { loop++; }, function () { loop++; });
                    }
                    pos++;
                }
            }

            this.readDirectory(directory, success, error);
        }
    }
    /**
      * Helper function to return entities in the directory path
      * @param {object} directoryPath - Directory to read.
      * @param {function} success - Success callback.
      * @param {function} error - Error callback.
      */
    HAPIFSProvider.prototype.readDirectory = function (directoryPath, success, error) {
        if (directoryPath == '/') {
            var entries = [];
            var shares = {};
            shares.isDirectory = true;
            shares.name = "shares";
            shares.size = 0;
            shares.modificationTime = new Date();
            var computers = {};
            computers.isDirectory = true;
            computers.name = "computers";
            computers.size = 0;
            computers.modificationTime = new Date();

            entries.push(shares);
            entries.push(computers);

            success(entries);
        }
        else if (directoryPath == '/shares') {
            this.hapiClient.getfilesandfolders("shares", this.hapiClient.CONST_ADSHARE_ROOTLEVEL_FOLDERENUMREQUEST, (function (shares) {
                var seen = [];
                var entries = [];
                for (var i = 0; i < shares.Items.length; i++) {
                    var fileident = shares.Items[i].FileIdentifier.replace("\\\\", "");
                    var entry = {};
                    entry.isDirectory = true;
                    entry.name = shares.Items[i].Name;
                    entry.size = shares.Items[i].Size;
                    entry.modificationTime = new Date(shares.Items[i].LastModifiedDate);
                    entry.fileIdentifier = shares.Items[i].FileIdentifier;
                    if (seen.indexOf(entry.name) == -1) {
                        entries.push(entry);
                        seen.push(entry.name);
                        this.fileCache.set('/shares/' + entry.name, entry);
                    }
                }
                success(entries);
            }).bind(this), (function () { error("NOT_FOUND"); }).bind(this));
        }
        else if (directoryPath == '/computers') {
            this.hapiClient.getallcomputers((function (computers) {
                var seen = [];
                var entries = [];
                for (var i = 0; i < computers.length; i++) {
                    var entry = {};
                    entry.isDirectory = true;
                    entry.name = computers[i].ComputerName;
                    entry.size = 0;
                    entry.modificationTime = new Date();
                    if (computers[i].AgentId == -1) {
                        entry.fileIdentifier = "directory" + computers[i].ComputerName + ":/";
                    }
                    else {
                        entry.fileIdentifier = "agent" + computers[i].AgentId + ":/";
                    }
                    if (seen.indexOf(entry.name) == -1) {
                        entries.push(entry);
                        seen.push(entry.name);
                        this.fileCache.set('/computers/' + entry.name, entry);
                    }
                }
                success(entries);
            }).bind(this), (function () { error("NOT_FOUND"); }).bind(this));
        }
        else {
            var fileIdentifier = this.fileCache.get(directoryPath).fileIdentifier;
            getFilesAndFolders.call(this, directoryPath, fileIdentifier, (function (entries) {
                success(entries)
            }).bind(this), (function () { error("NOT_FOUND"); }).bind(this));
        }
    }
    /**
      * Given a file identifier, get all of the info from the file/folder
      * @param {string} fileIdentifier - HAPI File Identifier to get info on
      */
    function getFileInfoFromFileIdentifier(fileIdentifier) {
        var agent = false;
        var controller = "share";
        if (fileIdentifier.startsWith("agent")) {
            agent = fileIdentifier.substring(5, fileIdentifier.indexOf(':'));
            fileIdentifier = fileIdentifier.substring(fileIdentifier.indexOf(':') + 1);
            controller = "agent/" + agent + "/share";
        }
        else if (fileIdentifier.startsWith("directory")) {
            fileIdentifier = "\\\\" + fileIdentifier.substring(9, fileIdentifier.indexOf(":"));
            controller = "directory";
        }

        return {
            agent: agent,
            controller: controller,
            fileIdentifier: fileIdentifier
        };
    }
    /**
      * Given a file identifier, get all of the info from the file/folder
      * @param {string} directoryPath - Path of directory
      * @param {string} fileIdentifier - HAPI File Identifier
      * @param {callback} success - Success callback
      * @param {callback} error - Error callback
      */
    function getFilesAndFolders(directoryPath, fileIdentifier, success, error) {
        var agent = false;
        var controller = "share";
        var fileInfo = getFileInfoFromFileIdentifier(fileIdentifier);
        agent = fileInfo.agent;
        controller = fileInfo.controller;
        fileIdentifier = fileInfo.fileIdentifier;

        console.log("FileIdentifier: " + fileIdentifier);
        console.log("DirectoryPath: " + directoryPath);
        console.log("Controller: " + controller);
        this.hapiClient.getfilesandfolders(controller, { FileIdentifier: fileIdentifier, Filters: [], MaxLevels: "0" }, (function (files) {
            var seen = [];
            var entries = [];
            for (var i = 0; i < files.Items.length; i++) {
                var entry = {};
                entry.isDirectory = files.Items[i].Type == 2 ? true : false;
                entry.name = files.Items[i].Name;
                entry.size = files.Items[i].Size;
                entry.modificationTime = new Date(files.Items[i].LastModifiedDate);
                if (agent) {
                    entry.fileIdentifier = "agent" + agent + ":" + files.Items[i].FileIdentifier;
                }
                else {
                    entry.fileIdentifier = files.Items[i].FileIdentifier;
                }
                if (seen.indexOf(entry.name) == -1) {
                    entries.push(entry);
                    seen.push(entry.name);

                    this.fileCache.set(directoryPath + '/' + entry.name, entry);
                }
            }

            success(entries);
        }).bind(this), (function () { error("NOT_FOUND"); }).bind(this));
    }
    /**
      * Assign all of our handlers to the Chrome FileSystemProvider events
      */
    function assignEventHandlers() {
        if (!this.assigendEventHandlers) {
            chrome.fileSystemProvider.onUnmountRequested.addListener(this.onUnmountRequested.bind(this));
            chrome.fileSystemProvider.onGetMetadataRequested.addListener(this.onGetMetadataRequested.bind(this));
            chrome.fileSystemProvider.onReadDirectoryRequested.addListener(this.onReadDirectoryRequested.bind(this));
            chrome.fileSystemProvider.onOpenFileRequested.addListener(this.onOpenFileRequested.bind(this));
            chrome.fileSystemProvider.onCloseFileRequested.addListener(this.onCloseFileRequested.bind(this));
            chrome.fileSystemProvider.onReadFileRequested.addListener(this.onReadFileRequested.bind(this));
            chrome.fileSystemProvider.onCreateDirectoryRequested.addListener(this.onCreateDirectoryRequested.bind(this));
            chrome.fileSystemProvider.onDeleteEntryRequested.addListener(this.onDeleteEntryRequested.bind(this));
            chrome.fileSystemProvider.onCreateFileRequested.addListener(this.onCreateFileRequested.bind(this));
            chrome.fileSystemProvider.onCopyEntryRequested.addListener(this.onCopyEntryRequested.bind(this));
            chrome.fileSystemProvider.onMoveEntryRequested.addListener(this.onMoveEntryRequested.bind(this));
            chrome.fileSystemProvider.onTruncateRequested.addListener(this.onTruncateRequested.bind(this));
            chrome.fileSystemProvider.onWriteFileRequested.addListener(this.onWriteFileRequested.bind(this));
            chrome.fileSystemProvider.onAbortRequested.addListener(this.onAbortRequested.bind(this));
            this.assigendEventHandlers = true;
        }
    }
    /**
      * Given a file identifier, get all of the info from the file/folder
      * @param {int} requestId - Chrome FileSystem Provider's request id
      * @param {function} callback - Callback function to call with the error
      * @param {string} providerError - Error to return
      */
    function clientFailure(requestId, callback, providerError) {
        console.log("HAPIFSProvider - clientFailure - " + JSON.stringify(arguments));
        if (this.retries < 3) {
            this.retries++;
            chrome.storage.local.get(['hapifsgatekeeper', 'hapifsuser', 'hapifspass'], (function (items) {
                console.log("HAPIFSProvider.(Constructor).localStorage - " + JSON.stringify(items));
                if (!isNullOrEmpty(items.hapifsgatekeeper) && !isNullOrEmpty(items.hapifsuser) && !isNullOrEmpty(items.hapifspass)) {
                    this.login(items.hapifsgatekeeper, items.hapifsuser, items.hapifspass, (function () {
                        sendCallback.call(this, requestId, callback, "ABORT");
                    }).bind(this));
                }
                else {
                    sendCallback.call(this, requestId, callback, "ABORT");
                }
            }).bind(this));
        }
        else {
            this.reset();
            sendCallback.call(this, requestId, callback, providerError);
        }
    }
    /**
      * Helper function, checks to see if the object passed in is null 
      * or if a string, array, etc is it empty
      * @param {object} a - anything
      */
    function isNullOrEmpty(a) {
        if (typeof a == "undefined")
            return true;
        if (a === null)
            return true;
        if (a.length === 0)
            return true;
        return false;
    }
    /**
      * Returns a bool indicating if the path is deeper then an AD/Agent share level or not
      * @param {string} controller - HAPI Controller we are dealing with
      * @param {string} path - The path we are checking
      */
    function isAboveShareLevel(controller, path) {
        if (controller.toLowerCase() == "share") {
            var parts = path.split('/');
            if (parts.length > 3)
                return true;
            else
                return false;
        }

        return false;
    }
    /**
      * Helper function, that will pass whatever back to a callback
      * @param {object} this - just pass this, its easy
      * @param {int} requestId - the request id
      * @param {function} callback - the callback to call
      * @param {anything[]} n+ - whatever else you pass in, we put it all together and pass it to the callback for you
      */
    function sendCallback() {
        var args = Array.prototype.slice.call(arguments);
        var r = args[0];
        var f = args[1];
        var g = args.slice(2);

        this.retries = 0;

        if (this.requests[r])
            delete this.requests[r];

        if (typeof f === "function")
            f.apply(this, g);
    }

    // Export

    window.HAPIFSProvider = HAPIFSProvider;
})();







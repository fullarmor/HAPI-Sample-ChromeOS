"use strict";
/**************************************************************************************
 * <copyright file="FSPCache.js" company="FullArmor Corp.">                           *
 *    Copyright (c) 2015 FullArmor Corporation.  All rights reserved.                 *
 * </copyright>                                                                       *
 *                                                                                    *
 **************************************************************************************/

(function () {
  /**
    * FSPCache object
    * This object handles storing cached information about files and 
    * folders that we've gotten information on from HAPI.  It uses a 
    * simple get, set function style and uses chrome local storage to
    * persist the cache data (along with keeping it in memory)
    * @constructor
    */
  var FSPCache = function () {
      var prefix = "FSPCache_";
      var cache = {};
      /**
        * Get the file/folder info based on path from memrory, if not found look in local storage
        * @param {string} key - The path as a key.
        */
      this.get = function(key) {
          if (cache[key]) {
              return cache[key];
          }
          else {
              var newkey = prefix+key;
              chrome.storage.local.get(newkey, function(items) {
                  return items;
              });
          }
      };
      /**
        * Set the file/folder info based on path into memrory and local storage
        * @param {string} key - The path as a key.
        * @param {object} value - The file info object to cache.
        */
      this.set = function (key, value) {
          var newkey = prefix+key;
          cache[key] = value;
          chrome.storage.local.set({newkey: value});
      };
      /**
        * Remove a file/folder from the cache and optionally any of its children
        * @param {string} key - The path as a key.
        * @param {bool} recursive - Set to true to remove all children
        */
      this.remove = function (key, recursive) {
          var removeKeys = [];
          var recurse = typeof recursive !== 'undefined' ? recursive : false;
          removeKeys.push(key);
          if (recurse) {
              for(var k in Object.keys(cache)) {
                  if (k.startsWith(key)) {
                      removeKeys.push(k);
                  }
              }
          }
          
          for(var i=0; i<removeKeys.length; i++) {
              delete cache[removeKeys[i]];
          }
          
          chrome.storage.local.remove(removeKeys);
      };
  };
  
  window.FSPCache = FSPCache;
})();
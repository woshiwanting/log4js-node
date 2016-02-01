"use strict";
var BaseRollingFileStream = require('./BaseRollingFileStream')
, debug = require('../debug')('_DateRollingFileStream')
, format = require('../date_format')
, async = require('async')
, fs = require('fs')
, util = require('util');

module.exports = _DateRollingFileStream;

function currentFileSize(file) {
  var fileSize = 0;
  try {
    fileSize = fs.statSync(file).size;
  } catch (e) {
    fileSize = 0;
  }
  return fileSize;
}

function _DateRollingFileStream(filename, pattern, options, now, maxLogSize) {
  debug("Now is " + now);
  if (pattern && typeof(pattern) === 'object') {
    now = options;
    options = pattern;
    pattern = null;
  }
  this.pattern = pattern || '.yyyy-MM-dd';
  this.now = now || Date.now;

  if (fs.existsSync(filename)) {
    var stat = fs.statSync(filename);
    this.lastTimeWeWroteSomething = format.asString(this.pattern, stat.mtime);
  } else {
    this.lastTimeWeWroteSomething = format.asString(this.pattern, new Date(this.now()));
  }

  this.baseFilename = filename;
  this.alwaysIncludePattern = false;
  //default fileSize 2M
  this.maxLogSize = maxLogSize || 2 * 1000 * 1000;
  
  if (options) {
    if (options.alwaysIncludePattern) {
      this.alwaysIncludePattern = true;
      filename = this.baseFilename + this.lastTimeWeWroteSomething;
    }
    delete options.alwaysIncludePattern;
    if (Object.keys(options).length === 0) { 
      options = null; 
    }
  }
  debug("this.now is " + this.now + ", now is " + now);
  
  _DateRollingFileStream.super_.call(this, filename, options);
}
util.inherits(_DateRollingFileStream, BaseRollingFileStream);

_DateRollingFileStream.prototype.shouldRoll = function() {
  var lastTime = this.lastTimeWeWroteSomething,
  thisTime = format.asString(this.pattern, new Date(this.now()));
  
  debug("_DateRollingFileStream.shouldRoll with now = " + 
        this.now() + ", thisTime = " + thisTime + ", lastTime = " + lastTime);
  
  this.lastTimeWeWroteSomething = thisTime;
  this.previousTime = lastTime;
  
  return thisTime !== lastTime;
};

_DateRollingFileStream.prototype.roll = function(filename, callback) {
  var that = this;
  
  debug("Starting roll");
  
  if (this.alwaysIncludePattern) {
    this._previousTime = this._previousTime || this.previousTime || this.lastTimeWeWroteSomething;

    this.filename = this.baseFilename + this.lastTimeWeWroteSomething;

    var size = currentFileSize(this.baseFilename + this._previousTime);

    if (size <= this.maxLogSize) {
      this.filename = this.baseFilename + this._previousTime;
    } else {
      this._previousTime = null;
    }

    async.series([
      this.closeTheStream.bind(this),
      this.openTheStream.bind(this)
    ], callback);
  } else {
    var newFilename = this.baseFilename + this.previousTime;
    async.series([
      this.closeTheStream.bind(this),
      deleteAnyExistingFile,
      renameTheCurrentFile,
      this.openTheStream.bind(this)
    ], callback);
  }
  
  function deleteAnyExistingFile(cb) {
    //on windows, you can get a EEXIST error if you rename a file to an existing file
    //so, we'll try to delete the file we're renaming to first
    fs.unlink(newFilename, function (err) {
      //ignore err: if we could not delete, it's most likely that it doesn't exist
      cb();
    });
  }

  function renameTheCurrentFile(cb) {
    debug("Renaming the " + filename + " -> " + newFilename);
    fs.rename(filename, newFilename, cb);
  }

};

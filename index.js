'use strict';

var PromiseA = require('bluebird');
var fs = require('fs');
var path = require('path');
var homedir = require('homedir')();
var rcpath = path.join(homedir, '.oauth3');

fs.mkdir(rcpath, function (err) {
  if (err) {
    if ('EEXIST' !== err.code) {
      console.error("Could not create '" + rcpath + "': " + err);
      return;
    }
  }
});

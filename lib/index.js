'use strict';

var PromiseA = require('bluebird');
var fs = PromiseA.promisifyAll(require('fs'));
//var punycode = require('punycode');

var A = module.exports;

// TODO needs unit test
A._reHostname = /^[a-z0-9\.\-]+$/;                              // all valid (lowercase) hostnames
A._reConfname = /^[a-z0-9][a-z0-9\.\-]*\.[a-z0-9\-]+\.json$/;   // <domain>.<domain>.json
A.providers = ['oauth3.org', 'daplie.com', 'daplie.me', 'lds.io', 'hellabit.com'];
A.getConfname = function (filename) {
  /*
  if (!reHostname.test(domain)) {
    return false;
  }

  domain = punycode.toASCII(domain);

  if (!reHostname.test(domain)) {
    return false;
  }
  */

  if (A._reConfname.test(filename)) {
    return filename;
  }

  return '';
};
A.profile = function (conf) {
  return fs.mkdirAsync(conf.rcpath).then(function () {
    // yay
  }, function (err) {
    if ('EEXIST' !== err.code) {
      console.error("Could not create '" + conf.rcpath + "': " + err);
      return err;
    }
  }).then(function () {
    return fs.readdirAsync(conf.rcpath);
  }).then(function (nodes) {
    var results = { configs: [], errors: [] };
    nodes = nodes.filter(A.getConfname);
    return PromiseA.all(nodes.map(function (confname) {
      return fs.readFileAsync(confname, 'utf8').then(function (text) {
        try {
          results.configs.push(JSON.parse(text));
        } catch(e) {
          results.errors.push({ message: "could not parse", config: confname });
        }
      }, function (err) {
        results.errors.push({ code: err.code, message: "could not read", config: confname });
      });
    })).then(function () {
      return results;
    });
  });
};

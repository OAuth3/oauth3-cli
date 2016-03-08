'use strict';

var PromiseA = require('bluebird');
var fs = PromiseA.promisifyAll(require('fs'));
//var punycode = require('punycode');
var path = require('path');
var UUID = require('node-uuid');
var crypto = require('crypto');
var mkdirpAsync = PromiseA.promisify(require('mkdirp'));

var A = module.exports;

// TODO needs unit test
A._reHostname = /^[a-z0-9\.\-]+$/;                              // all valid (lowercase) hostnames
A._reConfname = /^[a-z0-9][a-z0-9\.\-]*\.[a-z0-9\-]+\.json$/;   // <domain>.<domain>.json
A.providers = ['oauth3.org'/*, 'daplie.com', 'daplie.me', 'lds.io', 'hellabit.com'*/];
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

A.device = function (conf) {
  var pathname = path.join(conf.rcpath, 'devices');

  return mkdirpAsync(pathname).then(function () {
    return fs.readdirAsync(pathname);
  }).then(function (nodes) {
    // TODO handle multiple device profiles

    var filename = path.join(pathname, 'default.json');

    console.log('device filename', filename);
    return fs.readFileAsync(filename, 'utf8').then(function (text) {
      return JSON.parse(text);
    }).then(function (json) { return json; }, function (err) {
      if ('ENOENT' === err.code) {
        return null;
      }

      if ('SyntaxError' === err.name) {
        var mtime = fs.statSync(filename).mtime;
        console.warn("[Error] couldn't parse '" + filename + "'.");
        console.warn("Run this command, then try again:");
        console.warn("    mv '" + filename + "' '" + filename + "."
            + (mtime.toISOString().replace(/[-:]/g, '').replace('T', '_').replace(/\..*/, ''))
            + ".bak'");
        process.exit(1);
        throw new Error('TODO: move corrupt file and show warning');
      }

      return PromiseA.reject(err);
    }).then(function (device) {
      if (!device) {
        device = {};
      }

      if (!device.uuid) {
        device.uuid = UUID.v4();
      }

      if (!device.hostname) {
        device.hostname = require('os').hostname();
      }

      if (!device.secret) {
        device.secret = crypto.randomBytes(16).toString('hex');
      }

      return fs.writeFileAsync(filename, JSON.stringify(device), 'utf8').then(function () {
        return { device: device };
      });
    });
  });
};

A.saveSession = function (state, setDefault) {
  var sessionfile = path.join(state.rcpath, 'logins', state.providerUrl, state.username + '.json');
  var accountsDir = path.join(state.rcpath, 'accounts');
  var defaultAccountFile = path.join(accountsDir, 'default.json');
  // TODO session for the account, or the login?
  var profile = {
    sessions: [
      { accounts: state.accounts
      , session: state.session
      , userMeta: state.userMeta
      }
    ]
  };

  return fs.writeFileAsync(sessionfile, JSON.stringify(profile), 'utf8').then(function () {
    function write() {
      var json = JSON.stringify({
        providerUrl: state.providerUrl
      , userId: state.username
      , accountId: state.account.idx || state.account.appScopedId
      });
      return fs.writeFileAsync(defaultAccountFile, json, 'utf8');
    }

    return mkdirpAsync(accountsDir).then(function () {
      return fs.existsAsync(defaultAccountFile).then(function () {
        return write();
      }, function () {
        if (setDefault) {
          return write();
        }
      });
    });
  });
};

A.session = function (state) {
  // TODO lowercase domain portion of providerUrl
  // TODO handle '/' in providerUrl as non-directory (?)
  // TODO account identifier irrespective of username
  var providerDir = path.join(state.rcpath, 'logins', state.providerUrl);

  return mkdirpAsync(providerDir).then(function () {
    var sessionfile = path.join(state.rcpath, 'logins', state.providerUrl, state.username + '.json');
    console.log('sesion file', sessionfile);
    return fs.readFileAsync(sessionfile, 'utf8').then(function (text) {
      return JSON.parse(text);
    }).then(function (data) {
      return data;
    }, function (err) {
      if ('SyntaxError' === err.name) {
        throw err;
      }

      return null;
    }).then(function (profile) {
      //state.providerUrl
      if (!profile) {
        profile = {};
      }
      if (!Array.isArray(profile.accounts)) {
        profile.accounts = [];
      }

      return profile.sessions;
    });
  }).then(function (sessions) {
    state.triedSession = true;

    var session = sessions && sessions[0];

    if (!Array.isArray(sessions) || !session) {
      return null;
    }

    return session;
  });
};

A.getDefaults = function (state) {
  if (state.providerUrl && state.username && state.accountId) {
    return PromiseA.resolve(null);
  }

  var accountsDir = path.join(state.rcpath, 'accounts');
  var defaultAccount = path.join(accountsDir, 'default.json');

  return mkdirpAsync(accountsDir).then(function () {
    return fs.readFileAsync(defaultAccount, 'utf8').then(function (text) {
      var defs;

      try {
        defs = JSON.parse(text);
      } catch(e) {
        return;
      }

      // false / null should count as purposefully ignoring the defaults
      if ('undefined' === typeof state.providerUrl || defs.providerUrl === state.providerUrl) {
        state.providerUrl = defs.providerUrl;
        if ('undefined' === typeof state.username || defs.userId === state.username) {
          state.username = defs.userId;
          if ('undefined' === typeof state.accountId || defs.accountId === state.accountId) {
            state.accountId = defs.accountId;
          }
        }
      }

    }, function (err) {
      if ('ENOENT' === err.code) {
        return;
      }

      return PromiseA.reject(err);
    });
  });
};

A.profile = function (conf) {
  var pathname = path.join(conf.rcpath, 'logins');

  return mkdirpAsync(pathname).then(function () {
    return fs.readdirAsync(pathname);
  }).then(function (nodes) {
    var results = { configs: [], errors: [] };
    nodes = nodes.filter(A.getConfname);
    return PromiseA.all(nodes.map(function (confdir) {
      return fs.readdirAsync(path.join(pathname, confdir), 'utf8').then(function (confnames) {
        return PromiseA.all(confnames.map(function (confname) {
          var confFilename = path.join(pathname, confdir, confname);
          console.log('confFilename', confFilename);
          return fs.readFileAsync(confFilename, 'utf8').then(function (text) {
            try {
              results.configs.push(JSON.parse(text));
            } catch(e) {
              results.errors.push({ message: "could not parse", config: confname });
            }
          }, function (err) {
            results.errors.push({ code: err.code, message: "could not read", config: confname });
          });
        }));
      }, function (err) {
        results.errors.push({ code: err.code, message: "could not read", config: confdir });
      });
    })).then(function () {
      return results;
    });
  });
};


var PromiseA = require('bluebird');
var requestAsync = PromiseA.promisify(require('request'));
A.searchDomains = function (sld, tld) {
  return requestAsync({
    url: 'https://oauth3.org/api/com.enom.reseller/check-availability/' + sld + '/' + tld
  }).then(function (res) {
    var data = JSON.parse(res.body);
    if (data.error) {
      return PromiseA.reject(data.error);
    }
    return data;
  });
};

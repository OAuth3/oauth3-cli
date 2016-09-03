'use strict';

// I don't know why, but some modules don't work in node.js 0.10
if (parseInt(process.version.replace(/v(\d+)\.(\d+).*/, '$1.$2'), 10) < 4) {
  console.log('Please upgrade node.js to v4.3 or greater');
  console.log('');
  console.log('For just node.js:');
  console.log('    curl -L bit.ly/nodejs-min | bash');
  console.log('');
  console.log('For node.js + development tools:');
  console.log('    curl -L bit.ly/nodejs-dev-install -o ./node-dev; bash ./node-dev');
  console.log('');
  process.exit(0);
}

// TODO preserve history
// each time a selection is made it should be masked (if secret),
// placed on the first line, the cursor should move to the end line,
// and then a newline should be entered at the bottom to scroll the
// top line up one and then the screen should be rewritten.
// In this way the user should have a history of his / her actions.

var Oauth3 = module.exports;
var PromiseA = require('bluebird');
var path = require('path');
//var stripe = require('./lib/stripe');
var stripeId = require('./config.stripe').live.id;
var stripe = require('stripe')(stripeId);
var A = require('../lib/oauth3');
var A3 = require('../lib/utils');
var jwt = require('jsonwebtoken');

var STATE = {};

/* setting rcpath to work around perms issue */
var tldsCacheDir = path.join(require('homedir')(), '.oauth3', 'caches', 'tlds');
var directivesCacheDir = path.join(require('homedir')(), '.oauth3', 'caches', 'directives');

// it's probably more expensive to write piecemeal than it is
// to just write the whole new thing all at once, but whatever
/*
function writeDiff(ws, cur, next) {
  var cols = ws.columns;
  var rows = ws.rows;

  (new Array(rows + 1).join(',').split(',')).forEach(function (_, x) {
    (new Array(cols + 1).join(',').split(',')).forEach(function (_, y) {
      if (cur[x][y] !== next[x][y]) {
        ws.cursorTo(x, y);
        ws.write(next[x][y]);
      }
    });
  });
}
*/

/*
function range(n) {
  return (new Array(n).join('x').split('x'));
}

function debug(ws, state, msg) {
  // TODO scrolling debug log
  state.debugs.push(msg);
  while (state.debugs.length > 3) {
    state.debugs.shift();
  }
  say(ws, state, state.debugs, 3);
}
*/

function log(state, msg) {
  if (!state.debug) {
    return;
  }

  console.log('[oauth3]', msg);
}

STATE.createCredential = function (state) {
  log(state, 'STATE.createCredential');
  // TODO standardize account creation
  return A3.createCredential(state.oauth3, {
    appId: state.appId || state.oauth3.provider_uri
  , nodeType: 'email'
  , userId: state.username
  , secret: state.secret
  , mfa: state.totpKey && { totp: state.totpKey }
  //, tetantId: state.tenantId
  }).then(function (result) {
    // TODO save credential meta to file (and account later)
    //console.log('[oauth3-cli] Success createCredential');
    //console.log(result);
    state.userMeta = result;
      //console.log('[oauth3-cli] DEBUG');
      //console.log(result);
      //process.exit(1);
    return;
  }, function (err) {
    console.error('[oauth3-cli] Error createCredential');
    console.error(err.stack);
    console.error(err.result);
    process.exit(1);
  });
};

STATE.loadProfiles = function (state) {
  log(state, 'STATE.loadProfile');

  if (state.configs) {
    return PromiseA.resolve(null);
  }

  return A.profiles.all({
    rcpath: state.rcpath
  }).then(function (results) {
    if (results.errors.length) {
      state.msgs = results.errors.map(function (err) {
        return " * " + err.code + ": " + (err.message || err.toString());
      });
      state.msgs.unshift("ERROR: encountered errors while reading your config directory:");

      return PromiseA.reject(new Error("encountered errors"));
    }

    state.configs = results.configs;

    return null;
  });
};

STATE.loadDevice = function (state) {
  log(state, 'STATE.loadDevice');

  return A.devices.one({
    rcpath: state.rcpath
  , device: state.device
  }).then(function (results) {
    state.device = results.device;

    return null;
  });
};

function cacheIt(filename, cb) {
  var fs = PromiseA.promisifyAll(require('fs'));
  var pathname = path.dirname(filename);

  function write(results) {
    var mkdirpAsync = PromiseA.promisify(require('mkdirp'));

    return mkdirpAsync(pathname, function () {
      return fs.writeFileAsync(
        filename
      , JSON.stringify({ updatedAt: Date.now(), results: results }, null, 2) + '\n'
      , 'utf8'
      ).then(function () {
        return results;
      });
    });
  }

  return fs.readFileAsync(filename, 'utf8').then(function (text) {
    var data = JSON.parse(text);

    if (Date.now() - data.updatedAt > (72 * 60 * 60 * 1000)) {
      cb().then(write);
    }

    return data.results;
  }).then(function (results) {
    return results;
  }, function () {
    return cb().then(write);
  });
}

STATE.getProviderDirectives = function (state) {
  log(state, 'STATE.getProviderDirectives');

  var path = require('path');
  var filename = path.join(state.directivesCacheDir, state.providerUrl) + '.json';

  function discover() {
    // TODO pay attention to cache headers
    return A3.discover(state.providerUrl).then(function (results) {
      if (!results.access_token) {
        return PromiseA.reject(new Error("missing directive for access_token"));
      }

      return results;
    });
  }

  return cacheIt(filename, discover).then(function (results) {
    state.oauth3 = results;
  });
};

STATE.getCredentialMeta = function (state) {
  log(state, 'STATE.getCredentialMeta');

  return A3.getCredentialMeta(state.oauth3, state.username).then(function (results) {
    if (!results) {
      console.error('[Error]: Sanity Check Fail: no result');
      process.exit(1);
      return;
    }

    if (results.kdf || results.useCode || results.recoverableNodes) {
      state.userMeta = results;
      return null;
    }

    console.error('[Error]: Sanity Check Fail: unusual result');
    console.error(results);

    process.exit(1);
  }, function (err) {
    // TODO results.code
    if (/not exist/.test(err.message || err.description)) {
      state.userMeta = {};
      return null;
    }

    console.error('[Error]: Sanity Check Fail: unusual error');
    console.error(err);
    process.exit(1);
  });
};

STATE.loginCode = function (state) {
  log(state, 'STATE.loginCode');

  state.otpCode = null;

  return A3.requests.loginCode(state.oauth3, {
    id: state.username
  , appId: state.appId || state.providerUrl
  , clientAgreeTos: 'oauth3.org/tos/draft'
  , clientUri: 'oauth3.org'
  //, tenantId: 'oauth3.org' // TODO make server assume default tenant
  }).then(function (codeData) {
    // TODO cache
    state.otpUuid = codeData.uuid;
    state.otpExpires = codeData.expiresAt;
  });
};

STATE.loginCredential = function (state) {
  log(state, 'STATE.loginCredential');

  var promise;

  if (state.otpCode) {
    promise = PromiseA.resolve(null);
  }
  else {
    promise = A3.getProof(state.oauth3, state.userMeta, state.secret);
  }

  return promise.then(function (proofstr) {
    return A3.requests.resourceOwnerPassword(state.oauth3, {
      id: state.username
    , secret: proofstr || state.otpCode
    , scope: state.scope
    , totp: state.totpToken
    , otp: state.otpCode
    , otpUuid: state.otpUuid
    , appId: state.appId || state.providerUrl
    , clientAgreeTos: 'oauth3.org/tos/draft'
    , clientUri: 'oauth3.org'
    // , tenantId: 'oauth3.org' // TODO make server assume default tenant
    }).then(function (result) {
      state.otpCode = null;
      state.secret = null;  // ditto
      proofstr = null;      // garbage collect the secret faster

      return result;
    }, function (error) {
      /*
      // TODO
      var err;
      err = new Error(result.error.message || result.error_description);
      err.code = result.error.code || result.error;
      err.uri = result.error.uri || result.error_uri;
      err.result = result;
      */

      return PromiseA.reject(error);
    }).then(function (result) {
      state.session = result;
      state.session.decoded = jwt.decode(state.session.accessToken);

      return STATE.testSession(state);
      //return null;
    }, function (err) {
      state.secret = null;  // ditto
      proofstr = null;      // garbage collect the secret faster
      console.error("[oauth3-cli] login Error:");
      console.error(err.stack || err);
      console.error(err.result);
      process.exit(1);
      /*
      state.userMeta = null;
      state.session = null;
      state.totpToken = null;
      */
      //return PromiseA.reject(err);
    });
  });
};

STATE.testSession = function (state) {
  log(state, 'STATE.testSession');

  return A3.requests.inspectToken(state.oauth3, state.session).then(function (/*result*/) {
    state.sessionTested = true;
  });
};

STATE.getAccounts = function (state) {
  log(state, 'STATE.getAccounts');

  // TODO force account refresh
  var decoded = state.session.decoded;
  var accounts = (
        decoded.sub && !/keypairs/.test(decoded.sub) && decoded.sub.split(/,/g).map(function (ppid) {
          return { idx: ppid };
        })
      )
      || (decoded.acx && [ { idx: decoded.acx } ])
      || decoded.axs || decoded.acs
      || (decoded.acc && [ { id: decoded.acc } ])
    ;

  if (accounts) {
    state.accounts = accounts;
    return PromiseA.resolve(null);
  }

  if (!state.oauth3.accounts) {
    console.error("[oauth3-cli] handle profile NOT IMPLEMENTED");
    process.exit(1);
    /*
    if (!state.oauth3.profile) {
    }
    */
  }

  return A3.requests.accounts.all(state.oauth3, state.session).then(function (result) {
    state.accounts = result.accounts;
    return null;
  }, function (err) {
    console.error("[oauth3-cli] accounts Error:");
    console.error(err.stack || err);
    console.error(err.result);
    process.exit(1);
  });
};

STATE.getAccount = function (state) {
  log(state, 'STATE.getAccount');

  if (!state.accounts.length) {
    return STATE.createAccount(state);
  }

  state.accounts.forEach(function (account) {
    if (!state.accountId) {
      return;
    }

    if (account.idx === state.accountId
      || account.appScopedId === state.accountId
      || account.nick === state.accountId
      || account.comment === state.accountId
    ) {
      state.account = account;
    }
  });

  // TODO show selection menu
  if (!state.account) {
    state.account = state.accounts[0];
  }

  state.session.acx = (state.account.idx || state.account.appScopedId);

  return PromiseA.resolve(null);
};

STATE.getEcho = function (state) {
  log(state, 'STATE.getEcho');

  state.echo = true;
  return A3.requests.echo(state.oauth3, state.session).then(function (/*result*/) {
    //console.log('ECHO result');
    //console.log(result);
    return null;
  });
};

STATE.getExistingSession = function (state) {
  log(state, 'STATE.getExistingSession');

  var resave = false;
  var userMeta;

  state.triedSession = true;
  return A.session(state).then(function (savedSession) {
    var now;
    var then;

    if (!savedSession) {
      return null;
    }

    if (state.username && state.username !== savedSession.credentialId) {
      return null;
    }

    userMeta = savedSession.userMeta;
    now = Date.now();
    then = parseInt(savedSession.session.decoded.exp, 10) * 1000;
    if (now < then) {
      state.accounts = savedSession.accounts;
      state.session = savedSession.session;
      return null;
    }

    return A3.requests.refreshToken(state.oauth3, {
      appId: state.appId || state.providerUrl
    , clientAgreeTos: 'oauth3.org/tos/draft'
    , clientUri: 'oauth3.org'
    //, scope: state.scope
    // , tenantId: 'oauth3.org' // TODO make server assume default tenant
    , refreshToken: savedSession.session.refreshToken
    }).then(function (results) {
      resave = true;

      results.refreshToken = results.refreshToken || savedSession.session.refreshToken;

      state.accounts = null;
      state.account = null;

      state.session = results;
      state.session.decoded = jwt.decode(state.session.accessToken);

      return null;
    }, function (err) {
      console.error('[oauth3-cli] Refresh Token failure:');
      console.error(Object.keys(err));
      console.error(err);
      process.exit(1);
      return null;
    });
  }).then(function () {
    var err;

    if (!state.session) {
      state.accounts = null;
      state.account = null;
      state.userMeta = null;
      state.refreshToken = null;

      state.setDefault = true;
      err = new Error("Existing session was not useful for logging in as '" + state.username + "'");
      err.code = 'E_NO_AUTH';
      return PromiseA.reject(err);
    }

    return STATE.testSession(state).then(function () {
      state.userMeta = userMeta;

      if (resave) {
        return A.saveSession(state);
      }
    });
  });
};

STATE.createAccount = function (state) {
  log(state, 'STATE.createAccount');

  // TODO prompt for account nickname
  return A3.requests.accounts.create(state.oauth3, state.session, {
    nick: state.nick || state.username
  , self: {
      comment: 'created by oauth3.org cli'
    , username: state.username
    }
  }).then(function (result) {
    state.session.accessToken = result.accessToken || result.access_token;
    state.session.decoded = jwt.decode(state.session.accessToken);

    state.accounts = null;
    state.account = result.account;

    return null;
  }, function (err) {
    console.error("[oauth3-cli] account Error:");
    console.error(err.stack || err);
    console.error(err.result);
    process.exit(1);
  });
};

Oauth3._restoreSession = function (state) {
  log(state, 'Oauth3._restoreSession');

  function loopit() {
    return Oauth3._restoreSession(state);
  }


  // TODO load profile by provider / username
  if (!state.userMeta) {
    return STATE.getCredentialMeta(state).then(loopit);
  }
  else if (!state.userMeta.kdf && !state.requestOtp) {
    if (!state.totpKey) {
      return state.CLI.showQrAsync(state).then(function () {
        return state.CLI.verifyQrAsync(state);
      }).then(loopit);
    }
    else if (!state.secret) {
      return state.CLI.readNewCredentialSecretAsync(state).then(loopit);
    }
    else {
      return STATE.createCredential(state).then(loopit);
    }
  }
  else if (!state.session) {
    if (state.oauth3.otp && state.requestOtp) {

      if (!state.otpCode) {
        if (!state.otpUuid) {
          return STATE.loginCode(state).then(function () {
            return state.CLI.readCredentialOtpAsync(state).then(function () {
              return STATE.loginCredential(state);
            });
          }).then(loopit);
        }
        else {
          return state.CLI.readCredentialOtpAsync(state).then(function () {
            return STATE.loginCredential(state);
          }).then(loopit);
        }
      }

    }
    else if (!state.secret) {
      return state.CLI.readCredentialSecretAsync(state).then(loopit);
    }
    else if (state.userMeta.totpEnabledAt && !state.totpToken && false !== state.totpToken) {
      return state.CLI.readTotpTokenAsync(state).then(loopit);
    }
    else {
      return STATE.loginCredential(state).then(loopit);
    }
  }
  else if (!(state.accounts || state.profile)) {
    return STATE.getAccounts(state).then(loopit);
  }
  else if (state.accounts && !state.account) {
    return STATE.getAccount(state).then(loopit);
  }
  else if (!state.echo) {
    return STATE.getEcho(state).then(loopit);
  }
  else {
    return A.saveSession(state).then(function () {
      return state;
    });
  }
};

Oauth3._restoreConfig = function (state) {
  log(state, 'Oauth3._restoreConfig');

  function loopit() {
    return Oauth3._restoreConfig(state);
  }

  if (!state.configs) {
    return STATE.loadProfiles(state).then(loopit);
  }
  else if (!state.device || !state.device.uuid) {
    return STATE.loadDevice(state).then(loopit);
  }
  else if (!state.providerUrl) {
    // can't go any further
    return state.CLI.readProviderUrlAsync(state).then(loopit);
  }
  else if (!state.oauth3) {
    return STATE.getProviderDirectives(state).then(loopit);
  }
  else if (!state.username) {
    // can't go any further
    return state.CLI.readCredentialIdAsync(state).then(loopit);
  }
  else {
    // if (!state.triedSession)
    return STATE.getExistingSession(state).then(function () {
      return null;
    }, function () {
      return null;
    });
  }
};

Oauth3._loginHelper = function (state) {
  log(state, 'Oauth3._loginHelper');

  return Oauth3._restoreConfig(state).then(function () {
    return Oauth3._restoreSession(state).then(function () {
      return state;
    });
  });
};

Oauth3._autoLoginHelper = function (state) {
  log(state, 'Oauth3._autoLoginHelper');

  // state.{providerUrl,username,accountId}
  return A.getDefaults(state).then(function () {
    var err;
    if (!state.providerUrl || !state.username || !state.accountId) {
      state.setDefault = true;
      err = new Error('not logged in');
      err.code = 'E_NO_AUTH';
      return PromiseA.reject(err);
    }

    // state.configs
    return STATE.loadProfiles(state);
  }).then(function () {
    // state.device
    return STATE.loadDevice(state);
  }).then(function () {
    // state.oauth3
    return STATE.getProviderDirectives(state);
  }).then(function () {
    // state.triedSession
    // state.session
    return STATE.getExistingSession(state);
  }).then(function () {
    // state.accounts
    return STATE.getAccounts(state);
  }).then(function () {
    // state.account
    return STATE.getAccount(state);
  }).then(function () {
    return state && state.account && state.session || null;
    /*
    return {
      oauth3: state.oauth3
    , session: state.session
    , account: state.account
    , device: state.device
    };
    */
  }, function (err) {
    if ('E_NO_AUTH' === err.code) {
      return null;
    }

    return PromiseA.reject(err);
  });
};

Oauth3._init = function (state, options) {
  log(state, 'Oauth3._init');

  var homedir = require('homedir')();
  var CLI = require('./cli.js');

  state.homedir = homedir;
  state.rcpath = path.join(state.homedir, '.oauth3');
  state.tldsCacheDir = tldsCacheDir;
  state.directivesCacheDir = directivesCacheDir;
  state.hints = [];

  if (!state.state) {
    state.state = 'loading';
  }

  if (!state.msgs) {
    state.msgs = ['...'];
  }
  if (!state.codes) {
    state.codes = '';
  }
  if (!state.debugs) {
    state.debugs = [];
  }

  state.CLI = state.CLI || {};

  Object.keys(CLI).forEach(function (key) {
    if (!state.CLI[key]) {
      state.CLI[key] = CLI[key];
    }
  });

  state.ws = state.ws || state.CLI.init(process.stdin, process.stdout, state, options);
};

Oauth3._loginInit = function (state, options) {
  log(state, 'Oauth3._loginInit');

  state.username = options.credentialId || options.username || options.id;
  state.providerUrl = options.provider;
  state.totpKey = options.totp;
  state.secret = options.secret;
  state.scope = options.scope;
  state.appId = options.client;

  if ('false' === state.totpKey) {
    state.totpKey = false;
    state.totpToken = false;
  }

  if (state.totpKey) {
    state.totpToken = require('authenticator').generateToken(state.totpKey);
    if (!state.totpToken) {
      throw new Error("invalid totp key");
    }
  }
};

function addressInit(state, options) {
  state.rawAddr = {};
  state.rawAddr.firstName = (options['first-name'] || '').toString();
  state.rawAddr.lastName = (options['last-name'] || '').toString();
  state.rawAddr.email = (options.email || '').toString();
  state.rawAddr.phone = (options.phone || '').toString();
  state.rawAddr.line1 = (options.line1 || '').toString();
  state.rawAddr.line2 = (options.line2 || '').toString();
  if (state.rawAddr.line1 && !state.rawAddr.line2) {
    state.rawAddr.line2 = ' ';
  }
  state.rawAddr.locality = (options.locality || '').toString();
  state.rawAddr.region = (options.region || '').toString();
  state.rawAddr.postalCode = (options['postal-code'] || '').toString();
  state.rawAddr.countryCode = (options['country-code'] || '').toString();
}

function ccInit(state, options) {
  state.ccNumber = options['cc-number'] || options.ccNumber || options.cardNumber;
  state.ccExp = options['cc-exp'] || options.ccExp || options.cardExpiration;
  state.ccCvc = options['cc-cvc'] || options.ccCvc || options.cardCvc;
  state.ccEmail = options['cc-email'] || options.ccEmail || options.cardEmail;
  state.ccNick = options['cc-nick'] || options.ccNick || options.cardNick;
  state.ccComment = options['cc-comment'] || options.ccComment || options.cardComment;
  state.ccPriority = options['cc-priority'] || options.ccPriority || options.cardPriority;
}

//
// Exports
//


Oauth3.A = A;
Oauth3.A3 = A3;

// API-level
Oauth3.create = function (state) {
  log(state, 'Oauth3.create');

  state = state || {};
  Oauth3._init(state, {});
  return state;
};
Oauth3.checkSession = function (state, options) {
  log(state, 'Oauth3._checkSession');

  Oauth3._loginInit(state, options);

  return Oauth3._autoLoginHelper(state).then(function () {
    return state.session;
  });
};
Oauth3.checkCredential = function (state, options) {
  log(state, 'Oauth3.checkCredential');

  state.username = state.username || options.username;
  return STATE.getCredentialMeta(state);
};
Oauth3.authenticate = function (state/*, options*/) {
  log(state, 'Oauth3.authenticate');

  // TODO
  // get email
  // request login code
  // cli login code
  // select account
  return Oauth3._loginHelper(state);
};

Oauth3.manualLogin = function (options) {
  //log(state, 'Oauth3.manualLogin');

  options = options || {};
  //var readline = require('readline');
  //var rl = readline.createInterface(process.stdin, process.stdout);
  var state = {};
  if (!options.requestOtp && false !== options.requestOtp) {
    state.requestOtp = true;
  }
  else {
    state.requestOtp = options.requestOtp;
  }
  Oauth3._init(state, options);
  Oauth3._loginInit(state, options);

  return Oauth3._loginHelper(state);
};

Oauth3.autoLogin = function (options) {
  //log(state, 'Oauth3.autoLogin');

  var state = {};
  options = options || {};
  Oauth3._init(state, options);
  Oauth3._loginInit(state, options);

  return Oauth3._autoLoginHelper(state).then(function (state) {
    return state;
  });
};

Oauth3.login = function (options) {
  return Oauth3.autoLogin(options).then(function (state) {
    if (!state) {
      return Oauth3.manualLogin(options);
    }
    return state;
  }, function (err) {
    if ('E_NO_AUTH' === err.code) {
      return Oauth3.manualLogin(options);
    }

    console.error("login Error");
    console.error(err.stack);
    process.exit(1);

    //return Oauth3.manualLogin(options);
  }).then(function (state) {
    return state;
  });
};

var Accounts = Oauth3.Accounts = {};
Accounts.destroy = function (options) {
  return Oauth3.autoLogin(options).then(function (state) {
    if (!state) {
      console.log('Not logged in.');
      return;
    }

    return A3.requests.accounts.destroy(state.oauth3, state.session, { accountId: options.account }).then(function (result) {
      console.info('result');
      console.info(result);
    });
  });
};
Accounts.select = function (options) {
  return Oauth3.autoLogin(options).then(function (state) {
    if (!state) {
      console.log('Not logged in.');
      return;
    }

    return A3.requests.accounts.all(state.oauth3, state.session).then(function (result) {
      var account = result.accounts.filter(function (account) {
        return options.account === (account.idx || account.appScopedId)
            || options.account === account.name
            || options.account === account.displayName
            || options.account === account.comment
        ;
      })[0];

      if (!account) {
        return null;
      }

      state.accountId = (account.idx || account.appScopedId);
      return STATE.getAccount(state).then(function () {
        return A.saveSession(state, true).then(function () {
          return account;
        });
      });
    });
  });
};
Accounts.list = function (options) {
  return Oauth3.login(options).then(function (state) {
    return A3.requests.accounts.all(state.oauth3, state.session);
  });
};
Accounts.whoami = function (options) {
  return Oauth3.autoLogin(options).then(function (state) {
    if (!state) {
      console.log('Not logged in.');
      return;
    }

    return A3.requests.accounts.all(state.oauth3, state.session).then(function (result) {
      return result.accounts.filter(function (account) {
        return state.session.acx === (account.idx || account.appScopedId);
      })[0];
    });
  });
};

var Addresses = Oauth3.Addresses = {};
function getMailingAddress(state) {
  return A3.requests.addresses.all(state.oauth3, state.session).then(function (results) {
    state.addresses = results;

    return A3.requests.emails.all(state.oauth3, state.session).then(function (results) {
      state.emails = results;

      return A3.requests.phones.all(state.oauth3, state.session).then(function (results) {
        // TODO format phone
        state.phones = results;

        return Oauth3.CLI.readInputMailingAddressAsync(state);
      });
    });
  });
}
function getOrCreateMailingAddress(state) {
  return getMailingAddress(state).then(function (address) {
    var ps = [];
    var phone = address.phone;
    var email = address.email;

    function log(result) {
      console.log(result);
    }
    function logErr(err) {
      console.error(err.stack || err);
    }

    if (!state.addresses.some(function (addr) {
      if (addr.node === address.node) {
        return true;
      }
    })) {
      address = JSON.parse(JSON.stringify(address));
      delete address.phone;
      delete address.email;
      delete address.line1;
      delete address.line2;
      delete address.country;
      //delete address.node;
      state.addresses.push(address);
      ps.push(A3.requests.addresses.create(
        state.oauth3, state.session, address
      ).then(log, logErr));
    }

    // TODO format phone
    if (!state.phones.some(function (node) {
      if (phone === node.node) {
        return true;
      }
    })) {
      ps.push(A3.requests.phones.create(
        state.oauth3, state.session, { node: phone }
      ).then(log, logErr));
    }

    if (!state.emails.some(function (node) {
      if (email === node.node) {
        return true;
      }
    })) {
      ps.push(A3.requests.emails.create(
        state.oauth3, state.session, { node: email }
      ).then(log, logErr));
    }

    return PromiseA.all(ps);
  });
}
Addresses.list = function (options) {
  return Oauth3.login(options).then(function (state) {
    return A3.requests.addresses.all(state.oauth3, state.session);
  });
};
Addresses.create = function (options) {
  return Oauth3.login(options).then(function (state) {
    ccInit(state, options);
    addressInit(state, options);
    return getOrCreateMailingAddress(state).then(function (results) {
      console.log('results:', results);
    });
  });
};

var Cards = Oauth3.Cards = {};
Cards.list = function (options) {
  return Oauth3.login(options).then(function (state) {
    return A3.requests.cards.all(state.oauth3, state.session);
  });
};
/*
function getCards(state, cb) {
  state.card = true;
  return A3.requests.cards.all(state.oauth3, state.session).then(function (results) {

    if (results.length) {
      state.cards = results;
      cb(null);
      return;
    }

    return CLI.readCreditCardAsync(state).then(function (card) {
      state.cards = [ card ];
      cb(null);
    }, function (err, card) {
      if (err || card.error) {
        console.error("getCards Error");
        console.error(err || card);
        process.exit(1);
        return;
      }
    });
  });
}
*/
Cards.add = function (options) {
  return Oauth3.login(options).then(function (state) {
    var ccc = Oauth3.CLI.readCreditCardAsync;
    ccInit(state, options);
    return ccc(state).then(function (ccData) {
      stripe.tokens.create({
        // ccData
        card: {
          number: ccData.number
        , exp_month: ccData.exp_month
        , exp_year: ccData.exp_year
        , cvc: ccData.cvc
        }
      }).then(function (token) {
        return A3.requests.cards.create(state.oauth3, state.session, {
          service: 'stripe'
        , email: ccData.email
        , token: token
        , priority: state.ccPriority
        , nick: state.ccNick
        , comment: state.ccComment
        });
      });
      /*
      cb(null, {
        type: state.ccRule.abbr
      , name: state.ccRule.name
      , number: num
      , cvc: cvc
      , month: exp.substr(0, 2)
      , year: '20' + exp.substr(2, 2)
      , email: email
      });
      */
    });
  });
};
Cards.update = function (options) {
  return Oauth3.login(options).then(function (state) {
    return A3.requests.cards.update(state.oauth3, state.session, {
      last4: options.last4
    , brand: options.brand
    , comment: options.comment
    , email: options.email
    , exp: options.exp
    , nick: options.nick
    , priority: options.priority
    , default: options.default
    });
  });
};
Cards.remove = function (options) {
  return Oauth3.login(options).then(function (state) {
    return A3.requests.cards.remove(state.oauth3, state.session, {
      last4: options.last4
    , brand: options.brand
    , exp: options.exp
    });
  });
};

'use strict';

var PromiseA = require('bluebird');
var requestAsync = PromiseA.promisify(require('request'));

var A3 = module.exports;
A3.A3 = A3;

function noop(x) { return x; }

A3.parseOauth3Json = function (resp) {
  if (!(resp.statusCode >= 200 && resp.statusCode < 400)) {
    console.log('[A3] DEBUG', resp.body);
    return PromiseA.reject(new Error("bad response code: " + resp.statusCode));
  }

  var json = resp.body;

  //console.log('resp.body', typeof resp.body);
  if ('string' === typeof json) {
    try {
      json = JSON.parse(json);
    } catch(e) {
      console.log('[A3] DEBUG');
      console.log(resp.body);
      return PromiseA.reject(new Error('not parsable'));
    }
  }

  return json;
};

A3.parseProfileUrl = function (json) {
  if (!(json.profile || json.accounts)) {
    return PromiseA.reject({
      message: "no profile url"
    , code: "E_NO_OAUTH3_ACCOUNTS"
    });
  }

  return (json.profile || json.accounts);
};

A3.getOauth3Json = function (providerUri) {

  var url = 'https://' + providerUri + '/.well-known/oauth3.json';
  console.log('[A3] DEBUG 0th', url);
  return requestAsync(url).then(A3.parseOauth3Json).then(noop, function (/*err*/) {

    var url = 'https://' + providerUri + '/oauth3.json';
    console.log('[A3] DEBUG 1st', url);
    return requestAsync(url).then(A3.parseOauth3Json).then(noop, function (/*err*/) {
      // TODO needs reporting API -> /api/com.oauth3.providers/ + providerUri + /oauth3.json
      var url = 'https://oauth3.org/providers/' + providerUri + '/oauth3.json';

      console.log('[A3] DEBUG 2nd', url);
      return requestAsync(url).then(A3.parseOauth3Json).then(noop, function (/*err*/) {
        var url = 'https://raw.githubusercontent.com/OAuth3/providers/master/' + providerUri + '.json';

        console.log('[A3] DEBUG 3rd', url);
        return requestAsync(url).then(A3.parseOauth3Json);
      });
    });
  }).then(function (json) {
    json.provider_uri = providerUri;

    return json;
  });
};

A3.getUserMeta = function (oauth3, id) {
  var dir = oauth3.credential_meta || {
    method: 'GET'
  , url: 'https://' + oauth3.provider_uri + '/api/org.oauth3.provider/logins/meta/:type/:id'
  };

  return requestAsync({
    method: dir.method
  , url: dir.url.replace(/:type/, 'email').replace(/:id/, id)
  }).then(function (resp) {
    var json;

    try {
      json = JSON.parse(resp.body);
    } catch(e) {
      json = resp.body;
    }

    return json;
  });
};

A3.getAccounts = function (opts) {
  return requestAsync({
    method: 'GET'
  , url: opts.url
  , headers: {
      'Authorization': 'Bearer ' + opts.accessToken
    }
  });
};

/* opts = { appId: 'xxx', nodeType: 'email', userId: 'user@email.com', secret: '' } */
// 'MY_SPECIAL_SECRET'
A3.createUser = function (oauth3, opts) {
  // appId, userId, nodeType
  //var getProofOfSecret = require('authentication-microservice/lib/pbkdf2-utils').getProofOfSecret;
  //var sha256 = require('authentication-microservice/lib/pbkdf2-utils').sha256;
  var getProofOfSecret = require('./pbkdf2-utils').getProofOfSecret;
  var sha256 = require('./pbkdf2-utils').sha256;

  var kdfMeta = {
    salt: null // assigned below
  , kdf: 'pbkdf2'
  , algo: 'sha256'
  , iter: 678
  };
  //var userId = 'coolaj86@gmail.com';
  //var nodeType = 'email';
  var salt;

  // success because it's inherently recoverable
  //salt = sha256(new Buffer(userId).toString('hex') + config.appId);
  salt = sha256(new Buffer(opts.userId).toString('hex') + (opts.appId || require('crypto').randomBytes(16).toString('hex')));
  return getProofOfSecret(salt, opts.secret, kdfMeta.iter).then(function (proof) {
    var dir = oauth3.credential_login || {
      method: 'POST'
    , url: 'https://' + oauth3.provider_uri + '/api/org.oauth3.provider/logins'
    };
    var data = {
      node: opts.node || opts.id || opts.userId
    , type: opts.type || opts.nodeType
    , secret: opts.secret
    , kdf: proof
    , mfa: opts.mfa || null
/*
    , salt: salt
    , kdf: kdfMeta.kdf
    , algo: proof.algo || kdfMeta.algo
    , iter: proof.iter || kdfMeta.iter
    , bits: proof.bits
*/
    };

    //console.log('[lib/utils.js] data:');
    //console.log(result);
    //process.exit(1);

    return requestAsync({
      method: dir.method
    , url: dir.url
    , json: data
    }).then(A3.parseOauth3Json).then(function (result) {
      var err;

      if (!result || !result.success) {
        err = new Error("unexpected response result");
        err.result = result;
        return PromiseA.reject(err);
      }

      /*
      { salt: '21a0ca086d1f6f27d3947afd1c95e5bbdf6a86baada2ec9c07e08ee46e53de02',
        kdf: 'pbkdf2',
        algo: 'sha256',
        iter: 678,
        bits: 128,

        totpEnabledAt: 1451788122,
        recoverableNodes: [] }
      */

      proof.totpEnabledAt = opts.mfa && opts.mfa.totp && Date.now() || 0;
      proof.recoverableNodes = [{ node: data.node, type: data.type }];

      // TODO
      //state.userMeta = result;
      //if (result.jwt || result.access_token) {
      //  state.session = result;
      //}

      //console.log('[lib/utils.js] result:');
      //console.log(result);

      return proof;
    });
  });
};

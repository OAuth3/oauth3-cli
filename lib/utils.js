'use strict';

var PromiseA = require('bluebird');
var requestAsync = PromiseA.promisify(require('request'));

var A3 = module.exports;
A3.A3 = A3;

function noop(x) { return x; }

A3.parseProfileUrl = function (resp) {
  if (!(resp.statusCode >= 200 && resp.statusCode < 400)) {
    console.log('[A3] DEBUG', resp.body);
    return PromiseA.reject(new Error("bad response code: " + resp.statusCode));
  }

  var json = resp.body;

  console.log('resp.body', typeof resp.body);
  if ('string' === typeof json) {
    try {
      json = JSON.parse(json);
    } catch(e) {
      console.log('[A3] DEBUG');
      console.log(resp.body);
      return PromiseA.reject(new Error('not parsable'));
    }
  }

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
  return requestAsync(url).then(A3.parseProfileUrl).then(noop, function (/*err*/) {

    var url = 'https://' + providerUri + '/oauth3.json';
    console.log('[A3] DEBUG 1st', url);
    return requestAsync(url).then(A3.parseProfileUrl).then(noop, function (/*err*/) {
      // TODO needs reporting API -> /api/com.oauth3.providers/ + providerUri + /oauth3.json
      var url = 'https://oauth3.org/providers/' + providerUri + '/oauth3.json';

      console.log('[A3] DEBUG 2nd', url);
      return requestAsync(url).then(A3.parseProfileUrl).then(noop, function (/*err*/) {
        var url = 'https://raw.githubusercontent.com/OAuth3/providers/master/' + providerUri + '.json';

        console.log('[A3] DEBUG 3rd', url);
        return requestAsync(url).then(A3.parseProfileUrl);
      });
    });
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

'use strict';

// Staying as close to oauth3.js as reasonable
// https://github.com/OAuth3/browser-oauth3.js/blob/master/oauth3.js

var PromiseA = require('bluebird');
var requestAsync = PromiseA.promisify(require('request'));

var A3 = module.exports;
A3.A3 = A3;

function noop(x) { return x; }

A3.dnsValueType = function (value) {
  var type;

  if (/^\d+\.\d+\.\d+\.\d+$/.test(value)) {
    type = 'A';
  }
  else if (-1 !== value.indexOf(':') && /^[a-f:\.\d]+$/i.test(value)) {
    type = 'AAAA';
  }
  else if (/^https?:\/\/.*$/i.test(value)) {
    type = 'FWD';
  }
  else if (/[\w\-]+\.[\w\-]+/i.test(value)) {
    type = 'ANAME';
  }

  return type;
};

A3.stringifyscope = function (scope) {
  if (Array.isArray(scope)) {
    scope = scope.join(' ');
  }
  return scope;
};

A3.querystringify = function (params) {
  var qs = [];

  Object.keys(params).forEach(function (key) {
    if ('undefined' === typeof key) {
      return;
    }
    if ('scope' === key) {
      params[key] = A3.stringifyscope(params[key]);
    }
    qs.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
  });

  return qs.join('&');
};

A3.parseJson = function (resp) {
  var err;
  var json = resp.body;

  // TODO toCamelCase
  if (!(resp.statusCode >= 200 && resp.statusCode < 400)) {
    // console.log('[A3] DEBUG', resp.body);
    err = new Error("bad response code: " + resp.statusCode);
    err.result = resp.body;
    return PromiseA.reject(err);
  }

  //console.log('resp.body', typeof resp.body);
  if ('string' === typeof json) {
    try {
      json = JSON.parse(json);
    } catch(e) {
      err = new Error('response not parsable:', resp.body);
      err.result = resp.body;
      return PromiseA.reject(err);
    }
  }

  if (json.error) {
    return PromiseA.reject(json.error);
  }

  return json;
};

A3.request = function (opts) {
  return requestAsync({
    method: opts.method
  , url: opts.url || opts.uri
  , headers: opts.headers
  , json: opts.body || opts.data || opts.json // TODO which to use?
  }).then(A3.parseJson);
};

A3.requests = {};

// directive = { providerUri }
// opts = { username, passphrase }
A3.requests.resourceOwnerPassword = function (directive, opts) {
/*
  var scope = opts.scope;
  var appId = opts.appId;
    opts.providerUrl || opts.providerUri
  , opts.id || opts.username
  , opts.secret || opts.password || opts.passphrase
  , opts.scope ||
  , appId
*/

  return A3.request(A3.resourceOwnerPassword(directive, opts)).then(function (result) {
    // TODO just adjust all?
    result.accessToken = result.accessToken || result.access_token;
    result.refreshToken = result.refreshToken || result.refresh_token;
    result.expiresIn = result.expiresIn || result.expires_in;
    result.expiresAt = result.expiresAt || result.expires_at;

    return result;
  });
};

A3.requests.refreshToken = function (directive, opts) {
  return A3.request(A3.refreshToken(directive, opts)).then(function (result) {
    result.accessToken = result.accessToken || result.access_token;
    result.refreshToken = result.refreshToken || result.refresh_token || opts.refreshToken;
    result.expiresIn = result.expiresIn || result.expires_in;
    result.expiresAt = result.expiresAt || result.expires_at;

    return result;
  });
};

A3.discover = function (providerUrl) {

  var url = 'https://' + providerUrl + '/.well-known/oauth3.json';
  return A3.request({ url: url }).then(noop, function (/*err*/) {

    var url = 'https://' + providerUrl + '/oauth3.json';
    return A3.request({ url: url }).then(noop, function (/*err*/) {
      // TODO needs reporting API -> /api/com.oauth3.providers/ + providerUrl + /oauth3.json
      var url = 'https://oauth3.org/providers/' + providerUrl + '/oauth3.json';

      return A3.request({ url: url }).then(noop, function (/*err*/) {
        var url = 'https://raw.githubusercontent.com/OAuth3/providers/master/' + providerUrl + '.json';

        return A3.request({ url: url });
      });
    });
  }).then(function (json) {
    json.provider_uri = providerUrl;
    json.provider_url = providerUrl;

    return json;
  });
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

A3.getCredentialMeta = function (directive, id) {
  // TODO send back cryptorandom bits to HMAC with shared secret
  var dir = directive.credential_meta || {
    method: 'GET'
  , url: 'https://' + directive.provider_url + '/api/org.oauth3.provider/logins/meta/:type/:id'
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

A3.requests.accounts = function (directive, opts) {
  var dir = directive.accounts || {
    method: 'GET'
  , url: 'https://' + directive.provider_url + '/api/org.oauth3.provider/accounts'
  , bearer: 'Bearer'
  };

  return A3.request({
    method: dir.method || 'GET'
  , url: dir.url
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + opts.accessToken
    }
  });
};

A3.requests.accounts.create = function (directive, opts, account) {
  var dir = directive.create_account || {
    method: 'POST'
  , url: 'https://' + directive.provider_url + '/api/org.oauth3.provider/accounts'
  , bearer: 'Bearer'
  };
  var data = {
    account: account
  , logins: [
      {
        token: opts.accessToken
      }
    ]
  };

  return A3.request({
    method: dir.method || 'POST'
  , url: dir.url
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + opts.accessToken
    }
  , data: data
  });
};

A3.requests.inspectToken = function (directive, opts) {
  var dir = directive.inspect || {
    method: 'GET'
  , url: 'https://' + directive.provider_url + '/api/org.oauth3.provider/inspect_token'
  , bearer: 'Bearer'
  };

  return A3.request({
    method: dir.method || 'GET'
  , url: dir.url
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + opts.accessToken
    }
  });
};

A3.requests.echo = function (directive, opts) {
  var dir = directive.echo || {
    method: 'GET'
  , url: 'https://' + directive.provider_url + '/api/com.daplie.debug/echo'
  , bearer: 'Bearer'
  };

  return A3.request({
    method: dir.method || 'GET'
  , url: dir.url
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + opts.accessToken
    }
  });
};

A3.requests.cards = function (directive, opts) {
  var dir = directive.cards || {
    method: 'GET'
  , url: 'https://' + directive.provider_url + '/api/com.daplie.payments/accounts/:id/cards'
  , bearer: 'Bearer'
  };

  return A3.request({
    method: dir.method || 'GET'
  , url: dir.url
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + opts.accessToken
    }
  });
};
A3.requests.cards.all = A3.requests.cards;

A3.requests.cards.create = A3.requests.createCard = function (directive, session, opts) {
  var dir = directive.createCard || {
    method: 'POST'
  , url: 'https://' + directive.provider_url + '/api/com.daplie.payments/accounts/:id/cards'
  , bearer: 'Bearer'
  };

  return A3.request({
    method: dir.method || 'POST'
  , url: dir.url
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + session.accessToken
    }
  , json: {
      token: opts.token
    , service: opts.service || 'stripe'
    , email: opts.email
    , priority: opts.priority
    , nick: opts.nick
    , comment: opts.comment
    }
  });
};

A3.requests.cards.update = function (directive, session, opts) {
  var dir = directive.createCard || {
    method: 'POST'
  , url: 'https://' + directive.provider_url + '/api/com.daplie.payments/accounts/:id/cards/:nick/:brand'
  , bearer: 'Bearer'
  };
  var url = dir.url
    .replace(/:nick/, /*opts.nick ||*/ opts.last4)
    .replace(/:brand/, opts.brand || '')
  ;

  return A3.request({
    method: dir.method || 'POST'
  , url: url
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + session.accessToken
    }
  , json: {
      comment: opts.comment
    , default: opts.default
    , email: opts.email
    , exp: opts.exp
    , nick: opts.nick
    , priority: opts.priority
    }
  });
};

A3.requests.cards.remove = function (directive, opts, query) {
  var dir = directive.cards || {
    method: 'DELETE'
  , url: 'https://' + directive.provider_url + '/api/com.daplie.payments/accounts/:id/cards/:last4/:brand'
  , bearer: 'Bearer'
  };
  var url = dir.url
    .replace(/:last4/, query.last4)
    .replace(/:brand/, query.brand || '')
  ;

  return A3.request({
    method: dir.method || 'DELETE'
  , url: url
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + opts.accessToken
    }
  });
};

A3.requests.addresses = function (directive, opts) {
  var dir = directive.addresses || {
    method: 'GET'
  , url: 'https://' + directive.provider_url + '/api/com.daplie.me/accounts/:id/addresses'
  , bearer: 'Bearer'
  };

  return A3.request({
    method: dir.method || 'GET'
  , url: dir.url
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + opts.accessToken
    }
  });
};

A3.requests.createAddress = function (directive, session, opts) {
  var dir = directive.createAddress || {
    method: 'POST'
  , url: 'https://' + directive.provider_url + '/api/com.daplie.me/accounts/:id/addresses'
  , bearer: 'Bearer'
  };

  return A3.request({
    method: dir.method || 'POST'
  , url: dir.url
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + session.accessToken
    }
  , json: opts
  });
};

A3.requests.phones = function (directive, opts) {
  var dir = directive.phones || {
    method: 'GET'
  , url: 'https://' + directive.provider_url + '/api/com.daplie.me/accounts/:id/phones'
  , bearer: 'Bearer'
  };

  return A3.request({
    method: dir.method || 'GET'
  , url: dir.url
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + opts.accessToken
    }
  });
};

A3.requests.createPhone = function (directive, session, opts) {
  var dir = directive.createPhone || {
    method: 'POST'
  , url: 'https://' + directive.provider_url + '/api/com.daplie.me/accounts/:id/phones'
  , bearer: 'Bearer'
  };

  return A3.request({
    method: dir.method || 'POST'
  , url: dir.url
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + session.accessToken
    }
  , json: opts
  });
};

A3.requests.emails = function (directive, opts) {
  var dir = directive.emails || {
    method: 'GET'
  , url: 'https://' + directive.provider_url + '/api/com.daplie.me/accounts/:id/emails'
  , bearer: 'Bearer'
  };

  return A3.request({
    method: dir.method || 'GET'
  , url: dir.url
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + opts.accessToken
    }
  });
};

A3.requests.createEmail = function (directive, session, opts) {
  var dir = directive.createEmail || {
    method: 'POST'
  , url: 'https://' + directive.provider_url + '/api/com.daplie.me/accounts/:id/emails'
  , bearer: 'Bearer'
  };

  return A3.request({
    method: dir.method || 'POST'
  , url: dir.url
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + session.accessToken
    }
  , json: opts
  });
};



A3.requests.oldPurchase = function (directive, session, opts) {
  var dir = directive.purchase || {
    method: 'POST'
  , url: 'https://' + directive.provider_url + '/api/com.daplie.payments/accounts/:id/wallet'
  , bearer: 'Bearer'
  };

  return A3.request({
    method: dir.method || 'POST'
  , url: dir.url + '/add'
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + session.accessToken
    }
  , json: {
      amount: opts.amount
    , currency: opts.currency
    //, description: 'Purchase example.com'
    , cardId: opts.cardId
    //, customerId: opts.customerId
    , email: opts.email
    }
  }).then(function (charge) {
    if (charge.error) {
      console.error('ERROR [oauth3-cli] purchase (wallet add)');
      console.error(charge);
      process.exit(1);
      return;
    }
    console.log('[oauth3-cli] purchase (wallet add)');
    console.log(charge);

    return A3.request({
      method: dir.method || 'POST'
    , url: dir.url + '/subtract'
    , headers: {
        'Authorization': (dir.bearer || 'Bearer') + ' ' + session.accessToken
      }
    , json: {
        amount: opts.amount
      , currency: opts.currency
      , description: 'Purchase example.com'
      }
    }).then(function (txn) {
      if (txn.error) {
        console.error('ERROR [oauth3-cli] purchase (wallet auth)');
        console.error(txn);
        process.exit(1);
        return;
      }
      console.log('[oauth3-cli] purchase (wallet authorize)');
      console.log(txn);

      return A3.request({
        method: dir.method || 'POST'
      , url: dir.url + '/subtract/' + txn.id
      , headers: {
          'Authorization': (dir.bearer || 'Bearer') + ' ' + session.accessToken
        }
      }).then(function (cfm) {
        if (cfm.error) {
          console.error('ERROR [oauth3-cli] purchase (wallet capture)');
          console.error(cfm);
          process.exit(1);
          return;
        }
        console.log('[oauth3-cli] purchase (wallet capture)');
        console.log(cfm);

        process.exit(1);
      });
    });
  });
};

A3.requests.domains = function (directive, session) {
  var dir = directive.domains || {
    method: 'GET'
  , url: 'https://' + directive.provider_url + '/api/com.enom.reseller/accounts/:accountId/registrations'
  , bearer: 'Bearer'
  };
  var url = dir.url
    .replace(/:accountId/, session.acx)
  ;

  return A3.request({
    method: dir.method || 'GET'
  , url: url
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + session.accessToken
    }
  }).then(function (results) {
    if (results.error) {
      console.error('ERROR [oauth3-cli] registrations');
      console.error(results);
      process.exit(1);
      return;
    }

    return results;
  });
};

A3.requests.domains.purchase = A3.requests.purchaseDomains = function (directive, session, opts) {
  var dir = directive.purchaseDomains || {
    method: 'POST'
  , url: 'https://' + directive.provider_url + '/api/com.enom.reseller/accounts/:accountId/registrations'
  , bearer: 'Bearer'
  };
  var url = dir.url
    .replace(/:accountId/, session.acx)
  ;
  var data = {
    total: opts.total
  , tip: opts.tip
  , currency: opts.currency
  , description: opts.description
  , cardId: opts.cardId
  , customerId: opts.customerId
  , email: opts.email
  //, registrations: opts.domains
  , domains: opts.domains
  , address: opts.addr || opts.address
  };

  return A3.request({
    method: dir.method || 'POST'
  , url: url
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + session.accessToken
    }
  , json: data
  }).then(function (charge) {
    if (charge.error) {
      console.error('ERROR [oauth3-cli] purchase (registration)');
      console.error(charge);
      process.exit(1);
      return;
    }

    return charge;
  });
};

A3.requests.createDomainToken = function (directive, session, opts) {
  var dir = directive.domainToken || {
    method: 'POST'
  , url: 'https://' + directive.provider_url
      + '/api/com.enom.reseller/accounts/:accountId/ddns/tokens/:device'
  , bearer: 'Bearer'
  };
  var url = dir.url.replace(/:device/, opts.device);

  return A3.request({
    method: dir.method || 'POST'
  , url: url
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + session.accessToken
    }
  }).then(function (results) {
    if (results.error) {
      console.error('ERROR [oauth3-cli] createDomainToken');
      console.error(results);
      process.exit(1);
      return;
    }

    return results;
  });
};

A3.requests.dns = {};
A3.requests.dns.all = A3.requests.getAccountRecords = function (directive, session) {
  var dir = directive.domainRecords || {
    method: 'GET'
  , url: 'https://' + directive.provider_url + '/api/com.enom.reseller/accounts/:id/dns'
  , bearer: 'Bearer'
  };

  return A3.request({
    method: dir.method || 'GET'
  , url: dir.url
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + session.accessToken
    }
  }).then(function (results) {
    if (results.error) {
      console.error('ERROR [oauth3-cli] getAccountRecords');
      console.error(results);
      process.exit(1);
      return;
    }

    return results;
  });
};

A3.requests.dns.get = A3.requests.getDomainRecords = function (directive, session, opts) {
  var dir = directive.domainRecords || {
    method: 'GET'
  , url: 'https://' + directive.provider_url + '/api/com.enom.reseller/accounts/:id/dns/:tld/:sld'
  , bearer: 'Bearer'
  };

  return A3.request({
    method: dir.method || 'GET'
  , url: dir.url.replace(/:tld/, opts.tld).replace(/:sld/, opts.sld)
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + session.accessToken
    }
  }).then(function (results) {
    if (results.error) {
      console.error('ERROR [oauth3-cli] getDomainRecords');
      console.error(results);
      process.exit(1);
      return;
    }

    return results;
  });
};

// NOW NOW NOW
A3.requests.addDeviceToDomain = function (directive, session, opts) {
  var dir = directive.devices || {
    method: 'POST'
  , url: 'https://' + directive.provider_url
      + '/api/com.enom.reseller/accounts/:accountId/devices/:name/:tld/:sld/:sub'
  , bearer: 'Bearer'
  };
  var url = dir.url
    .replace(/:name/, opts.device)
    .replace(/:tld/, opts.tld)
    .replace(/:sld/, opts.sld)
    .replace(/:sub/, opts.sub || '')
  ;
  var query = {};

  [ 'addresses', 'update', 'ttl'/*, 'priority'*/ ].forEach(function (key) {
    if ('undefined' !== typeof opts[key]) {
      query[key] = opts[key];
    }
  });
  //query.access_token = session.accessToken;
  url += '?' + A3.querystringify(query);

  return A3.request({
    method: dir.method || 'POST'
  , url: url
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + session.accessToken
    }
  }).then(function (results) {
    if (results.error) {
      console.error('ERROR [oauth3-cli] addDeviceToDomain');
      console.error(results);
      process.exit(1);
      return;
    }

    return results;
  });
};

// NOW NOW NOW
A3.requests.setDdns = function (directive, session, opts) {
  var dir = directive.domainRecord || {
    method: 'GET'
  , url: 'https://' + directive.provider_url + '/api/com.enom.reseller/ddns'
  , bearer: 'GET'
  };

  return A3.request({
    method: dir.method || 'GET'
  , url: dir.url + '?' + A3.querystringify(opts)
  }).then(function (results) {
    if (results.error) {
      console.error('ERROR [oauth3-cli] ddns');
      console.error(results);
      process.exit(1);
      return;
    }

    return results;
  });
};
A3.requests.unsetDomainRecord = function (directive, session, opts) {
  var dir = directive.domainRecord || {
    method: 'DELETE'
  , url: 'https://' + directive.provider_url
      + '/api/com.enom.reseller/accounts/:accountId/dns/:tld/:sld/:sub/:type/:value'
  , bearer: 'Bearer'
  };
  var url = dir.url
    .replace(/:tld/, opts.tld)
    .replace(/:sld/, opts.sld)
    .replace(/:sub/, opts.sub || '.')
    .replace(/:type/, opts.type)
    .replace(/:value/, opts.value)
  ;

  return A3.request({
    method: dir.method || 'DELETE'
  , url: url
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + session.accessToken
    }
  }).then(function (results) {
    if (results.error) {
      console.error('ERROR [oauth3-cli] unsetDomainRecord');
      console.error(results);
      process.exit(1);
      return;
    }

    return results;
  });
};
A3.requests.setDomainRecord = function (directive, session, opts) {
  var dir = directive.domainRecord || {
    method: 'POST'
  , url: 'https://' + directive.provider_url
      + '/api/com.enom.reseller/accounts/:accountId/dns/:tld/:sld/:sub'
  , bearer: 'Bearer'
  };

  return A3.request({
    method: dir.method || 'POST'
  , url: dir.url
      .replace(/:tld/, opts.tld)
      .replace(/:sld/, opts.sld)
      .replace(/:sub/, opts.sub || '')
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + session.accessToken
    }
  , json: [{
      type: opts.type
    , value: opts.value
    , ttl: opts.ttl
    , priority: opts.priority
    }]
  }).then(function (results) {
    if (results.error) {
      console.error('ERROR [oauth3-cli] setDomainRecord');
      console.error(results);
      process.exit(1);
      return;
    }

    return results;
  });
};

A3.requests.getDevices = function (directive, session) {
  var dir = directive.devices || {
    method: 'GET'
  , url: 'https://' + directive.provider_url + '/api/com.enom.reseller/accounts/:id/devices'
  , bearer: 'Bearer'
  };

  return A3.request({
    method: dir.method || 'GET'
  , url: dir.url
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + session.accessToken
    }
  }).then(function (results) {
    if (results.error) {
      console.error('ERROR [oauth3-cli] getDevice');
      console.error(results);
      process.exit(1);
      return;
    }

    return results;
  });
};

A3.requests.setDevice = function (directive, session, opts) {
  var dir = directive.devices || {
    method: 'POST'
  , url: 'https://' + directive.provider_url + '/api/com.enom.reseller/accounts/:id/devices/:name'
  , bearer: 'Bearer'
  };

  return A3.request({
    method: dir.method || 'POST'
  , url: dir.url.replace(/:name/, opts.devicename)
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + session.accessToken
    }
  , json: {
      addresses: opts.addresses
    }
  }).then(function (results) {
    if (results.error) {
      console.error('ERROR [oauth3-cli] setDevice');
      console.error(results);
      process.exit(1);
      return;
    }

    return results;
  });
};

A3.requests.detachDevice = function (directive, session, opts) {
  var dir = directive.devices || {
    method: 'DELETE'
  , url: 'https://' + directive.provider_url + '/api/com.enom.reseller/accounts/:id'
      + '/devices/:name'
      + '/:tld/:sld/:sub'
  , bearer: 'Bearer'
  };
  var url = dir.url
    .replace(/:name/, opts.devicename)
    .replace(/:tld/, opts.tld)
    .replace(/:sld/, opts.sld)
    .replace(/:sub/, opts.sub || '')
  ;

  return A3.request({
    method: dir.method || 'DELETE'
  , url: url
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + session.accessToken
    }
  }).then(function (results) {
    if (results.error) {
      console.error('ERROR [oauth3-cli] detachDevice');
      console.error(results);
      process.exit(1);
      return;
    }

    return results;
  });
};

A3.requests.deleteDevice = function (directive, session, opts) {
  var dir = directive.devices || {
    method: 'DELETE'
  , url: 'https://' + directive.provider_url + '/api/com.enom.reseller/accounts/:id/devices/:name'
  , bearer: 'Bearer'
  };
  var url = dir.url.replace(/:name/, opts.devicename);

  return A3.request({
    method: dir.method || 'DELETE'
  , url: url
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + session.accessToken
    }
  }).then(function (results) {
    if (results.error) {
      console.error('ERROR [oauth3-cli] deleteDevice');
      console.error(results);
      process.exit(1);
      return;
    }

    return results;
  });
};

A3.requests.balance = function (directive, opts) {
  var dir = directive.echo || {
    method: 'GET'
  , url: 'https://' + directive.provider_url + '/api/com.daplie.payments/accounts/:id/balance'
  , bearer: 'Bearer'
  };

  return A3.request({
    method: dir.method || 'GET'
  , url: dir.url
  , headers: {
      'Authorization': (dir.bearer || 'Bearer') + ' ' + opts.accessToken
    }
  });
};

/* opts = { appId: 'xxx', nodeType: 'email', userId: 'user@email.com', secret: '' } */
// 'MY_SPECIAL_SECRET'
A3.getProof = function (directive, opts, secret) {
  var getProofOfSecret = require('./pbkdf2-utils').getProofOfSecret;
  return getProofOfSecret(opts.salt, secret, opts.iter).then(function (proof) {
    return proof.proof;
  });
};

A3.createCredential = function (directive, opts) {
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
    var dir = directive.credential_create || {
      method: 'POST'
    , url: 'https://' + directive.provider_url + '/api/org.oauth3.provider/logins'
    };

    // TODO send back shared secret based on proof
    // TODO allow keypair to be used in place of a shared secret
    var data = {
      node: opts.node || opts.id || opts.userId
    , type: opts.type || opts.nodeType
    , secret: opts.secret
    , kdf: proof
    , mfa: opts.mfa || null
    , tenants: [directive.provider_url]
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
    }).then(A3.parseJson).then(function (result) {
      var err;

      if (!result || !result.success) {
        console.log('[oauth-cli] lib/utils');
        console.log(typeof result);
        console.log(result);
        err = new Error("unexpected response result");
        err.result = result;
        // DEBUG
        process.exit(1);
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

A3.refreshToken = function (directive, opts) {
  // grant_type=refresh_token

  // Example Refresh Token Request
  // (generally for 1st or 3rd party server-side, mobile, and desktop apps)
  //
  // POST https://example.com/api/oauth3/access_token
  //    { "grant_type": "refresh_token", "client_id": "<<id>>", "scope": "<<scope>>"
  //    , "username": "<<username>>", "password": "password" }
  //
  opts = opts || {};
  var type = 'access_token';
  var grantType = 'refresh_token';

  var scope = opts.scope || directive.authn_scope;
  var clientId = opts.appId || opts.clientId;
  var clientSecret = opts.appSecret || opts.clientSecret;
  var args = directive[type];
  var params = {
    "grant_type": grantType
  , "refresh_token": opts.refreshToken
  , "response_type": 'token'
  //, "client_id": undefined
  //, "client_uri": undefined
  //, "scope": undefined
  //, "client_secret": undefined
  };
  var uri = args.url;
  var body;

  if (opts.clientUri) {
    params.client_uri = opts.clientUri;
  }

  if (clientId) {
    params.client_id = clientId;
  }

  if (clientSecret) {
    params.client_secret = clientSecret;
  }

  if (scope) {
    if (Array.isArray(scope)) {
      scope = scope.join(' ');
    }
    params.scope = scope;
  }

  if ('GET' === args.method.toUpperCase()) {
    uri += '?' + A3.querystringify(params);
  } else {
    body = params;
  }

  return {
    url: uri
  , method: args.method
  , data: body
  };
};

// directive = oauth3
// opts = { providerUri, username, passphrase }
A3.resourceOwnerPassword = function (directive, opts) {
  //
  // Example Resource Owner Password Request
  // (generally for 1st party and direct-partner mobile apps, and webapps)
  //
  // POST https://example.com/api/oauth3/access_token
  //    { "grant_type": "password", "client_id": "<<id>>", "scope": "<<scope>>"
  //    , "username": "<<username>>", "password": "password" }
  //
  opts = opts || {};
  var type = 'access_token';
  var grantType = 'password';

  var scope = opts.scope || directive.authn_scope;
  var clientId = opts.appId || opts.clientId;
  var args = directive[type];
  var params = {
    "grant_type": grantType
  , "response_type": 'token'
  , "username": opts.id || opts.username
  , "password": opts.secret || opts.passphrase || opts.password
  , "totp": opts.totp || opts.totpToken || undefined
  //, "jwt": opts.jwt // TODO sign a proof
  };
  var uri = args.url;
  var body;

  if (opts.clientUri) {
    params.client_uri = opts.clientUri;
  }

  if (opts.clientAgreeTos) {
    params.client_agree_tos = opts.clientAgreeTos;
  }

  if (clientId) {
    params.client_id = clientId;
  }

  if (scope) {
    if (Array.isArray(scope)) {
      scope = scope.join(' ');
    }
    params.scope = scope;
  }

  if ('GET' === args.method.toUpperCase()) {
    uri += '?' + A3.querystringify(params);
  } else {
    body = params;
  }

  return {
    url: uri
  , method: args.method
  , data: body
  };
};

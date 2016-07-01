exports.init = function (A3) {
  'use strict';


  // Devices
  A3.requests.devices = {};
  A3.requests.devices.all = function (directive, session) {
    var dir = directive.devices || {
      method: 'GET'
    , url: 'https://' + directive.provider_url + '/api/com.enom.reseller/accounts/:accountId/devices'
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
        console.error('ERROR [oauth3-cli] getDevice');
        console.error(results);
        process.exit(1);
        return;
      }

      return results;
    });
  };
  A3.requests.devices.set = function (directive, session, opts) {
    var dir = directive.devices || {
      method: 'POST'
    , url: 'https://' + directive.provider_url + '/api/com.enom.reseller/accounts/:accountId/devices/:name'
    , bearer: 'Bearer'
    };
    var url = dir.url
      .replace(/:accountId/, session.acx)
      .replace(/:name/, opts.devicename)
    ;

    return A3.request({
      method: dir.method || 'POST'
    , url: url
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
  A3.requests.devices.detach = function (directive, session, opts) {
    var dir = directive.devices || {
      method: 'DELETE'
    , url: 'https://' + directive.provider_url + '/api/com.enom.reseller/accounts/:accountId'
        + '/devices/:name'
        + '/:tld/:sld/:sub'
    , bearer: 'Bearer'
    };
    var url = dir.url
      .replace(/:accountId/, session.acx)
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
        console.error('ERROR [oauth3-cli] devices.detach');
        console.error(results);
        process.exit(1);
        return;
      }

      return results;
    });
  };
  A3.requests.devices.destroy = function (directive, session, opts) {
    var dir = directive.devices || {
      method: 'DELETE'
    , url: 'https://' + directive.provider_url + '/api/com.enom.reseller/accounts/:accountId/devices/:name'
    , bearer: 'Bearer'
    };
    var url = dir.url
      .replace(/:accountId/, session.acx)
      .replace(/:name/, opts.devicename)
    ;

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
  A3.requests.devices.attach = function (directive, session, opts) {
    var dir = directive.devices || {
      method: 'POST'
    , url: 'https://' + directive.provider_url
        + '/api/com.enom.reseller/accounts/:accountId/devices/:name/:tld/:sld/:sub'
    , bearer: 'Bearer'
    };
    var url = dir.url
      .replace(/:accountId/, session.acx)
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
  A3.requests.devices.token  = function (directive, session, opts) {
    var dir = directive.domainToken || {
      method: 'POST'
    , url: 'https://' + directive.provider_url
        + '/api/com.enom.reseller/accounts/:accountId/ddns/tokens/:device'
    , bearer: 'Bearer'
    };
    var url = dir.url
      .replace(/:accountId/, session.acx)
      .replace(/:device/, opts.device)
    ;

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


  // Domains
  A3.requests.domains = {};
  A3.requests.domains.all = function (directive, session) {
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
  A3.requests.domains.purchase = function (directive, session, opts) {
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

  // DNS
  A3.requests.dns = {};
  A3.requests.dns.all = function (directive, session) {
    var dir = directive.domainRecords || {
      method: 'GET'
    , url: 'https://' + directive.provider_url + '/api/com.enom.reseller/accounts/:accountId/dns'
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
        console.error('ERROR [oauth3-cli] getAccountRecords');
        console.error(results);
        process.exit(1);
        return;
      }

      return results;
    });
  };
  A3.requests.dns.get = function (directive, session, opts) {
    var dir = directive.domainRecords || {
      method: 'GET'
    , url: 'https://' + directive.provider_url + '/api/com.enom.reseller/accounts/:accountId/dns/:tld/:sld'
    , bearer: 'Bearer'
    };
    var url = dir.url
      .replace(/:accountId/, session.acx)
      .replace(/:tld/, opts.tld)
      .replace(/:sld/, opts.sld)
    ;

    return A3.request({
      method: dir.method || 'GET'
    , url: url
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
  A3.requests.dns.destroy = function (directive, session, opts) {
    var dir = directive.domainRecord || {
      method: 'DELETE'
    , url: 'https://' + directive.provider_url
        + '/api/com.enom.reseller/accounts/:accountId/dns/:tld/:sld/:sub/:type/:value'
    , bearer: 'Bearer'
    };
    var url = dir.url
      .replace(/:accountId/, session.acx)
      .replace(/:tld/, opts.tld)
      .replace(/:sld/, opts.sld)
      .replace(/:sub/, opts.sub || '.')
      .replace(/:type/, opts.type)
      .replace(/:value/, encodeURIComponent(opts.value))
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
  A3.requests.dns.set = function (directive, session, opts) {
    var dir = directive.domainRecord || {
      method: 'POST'
    , url: 'https://' + directive.provider_url
        + '/api/com.enom.reseller/accounts/:accountId/dns/:tld/:sld/:sub'
    , bearer: 'Bearer'
    };
    var url = dir.url
      .replace(/:accountId/, session.acx)
      .replace(/:tld/, opts.tld)
      .replace(/:sld/, opts.sld)
      .replace(/:sub/, opts.sub || '')
    ;

    return A3.request({
      method: dir.method || 'POST'
    , url: url
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

  // NameServer Glue Records
  A3.requests.glue = {};
  A3.requests.glue.all = function (directive, session) {
    var dir = directive.glue || {
      method: 'GET'
    , url: 'https://' + directive.provider_url + '/api/com.enom.reseller/accounts/:accountId/glue'
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
    }).then(function (result) {
      return result.records;
    });
  };
  A3.requests.glue.set = function (directive, session, opts) {
    var dir = directive.glue || {
      method: 'POST'
    , url: 'https://' + directive.provider_url
        + '/api/com.enom.reseller/accounts/:accountId/glue'
        + '/:tld/:sld/:sub'
    , bearer: 'Bearer'
    };
    var url = dir.url
      .replace(/:accountId/, session.acx)
      .replace(/:tld/, opts.tld)
      .replace(/:sld/, opts.sld)
      .replace(/:sub/, opts.sub || '')
    ;

    return A3.request({
      method: dir.method || 'POST'
    , url: url
    , headers: {
        'Authorization': (dir.bearer || 'Bearer') + ' ' + session.accessToken
      }
    , json: { ip: opts.ip }
    });
  };

  // NameServer Domain Records
  A3.requests.ns = {};
  A3.requests.ns.get = function (directive, session, opts) {
    var dir = directive.glue || {
      method: 'GET'
    , url: 'https://' + directive.provider_url
        + '/api/com.enom.reseller/accounts/:accountId/ns'
        + '/:tld/:sld/:sub'
    , bearer: 'Bearer'
    };
    var url = dir.url
      .replace(/:accountId/, session.acx)
      .replace(/:tld/, opts.tld)
      .replace(/:sld/, opts.sld)
      .replace(/:sub/, opts.sub || '')
    ;

    return A3.request({
      method: dir.method || 'GET'
    , url: url
    , headers: {
        'Authorization': (dir.bearer || 'Bearer') + ' ' + session.accessToken
      }
    });
  };
  A3.requests.ns.set = function (directive, session, opts) {
    var dir = directive.glue || {
      method: 'POST'
    , url: 'https://' + directive.provider_url
        + '/api/com.enom.reseller/accounts/:accountId/ns'
        + '/:tld/:sld/:sub'
    , bearer: 'Bearer'
    };
    var url = dir.url
      .replace(/:accountId/, session.acx)
      .replace(/:tld/, opts.tld)
      .replace(/:sld/, opts.sld)
      .replace(/:sub/, opts.sub || '')
    ;

    return A3.request({
      method: dir.method || 'POST'
    , url: url
    , headers: {
        'Authorization': (dir.bearer || 'Bearer') + ' ' + session.accessToken
      }
    , json: { nameservers: opts.nameservers }
    });
  };
};

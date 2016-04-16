'use strict';

var path = require('path');
var PromiseA = require('bluebird');
var a3request = require('./request').request;
var mkdirpAsync = PromiseA.promisify(require('mkdirp'));

var tldsPromise;

var tmp1name = 'domains.tmp1.json';
var tmp2name = 'domains.tmp2.json';
var bakname = 'domains.bak.json';
var origname = 'domains.json';

function readCache(cacheDir) {
  try {
    return require(path.join(cacheDir, origname));
  } catch(e) {
    try {
      return require(path.join(cacheDir, bakname));
    } catch(e) {
      return null;
    }
  }
}

function writeCache(cacheDir, domains, ignore) {
  var path = require('path');
  var fs = require('fs');

  // write new good
  try {
    fs.writeFileSync(path.join(cacheDir, tmp1name), JSON.stringify(domains, null, '  '), 'utf8');
  } catch(e) { if (!ignore) { console.error(e); } }
  try {
    fs.writeFileSync(path.join(cacheDir, tmp2name), JSON.stringify(domains, null, '  '), 'utf8');
  } catch(e) { if (!ignore) { console.error(e); } }

  try {
    // unlink if not broken
    fs.unlinkSync(path.join(cacheDir, bakname));
  } catch(e) { /* console.error(e); */ }
  try {
    // rename good to .bak
    fs.renameSync(path.join(cacheDir, tmp2name), path.join(cacheDir, bakname));
  } catch(e) { if (!ignore) { console.error(e); } }

  try {
    // unlink if not broken
    fs.unlinkSync(path.join(cacheDir, origname));
  } catch(e) { /* console.error(e); */ }
  try {
    // rename good to .bak
    fs.renameSync(path.join(cacheDir, tmp1name), path.join(cacheDir, origname));
  } catch(e) { if (!ignore) { console.error(e); } }
}

function getTldsHelper(opts) {
  var domains = readCache(opts.cacheDir) || readCache(__dirname) || { updatedAt: 0, tlds: [] };

  domains.tlds = domains.tlds.filter(function (tld) {
    return tld.enabled
      // think of the children!
      // (and try to prevent scrapers from incorrectly tagging this content)
      && -1 === ['x' + 'xx', 's' + 'ex', 'ad' + 'ult', 'po' + 'rn'].indexOf(tld.tld)
      // TODO handle punycode properly
      && !/^xn--/.test(tld.tld)
      ;
  });

  domains.tlds.forEach(function (tld) {
    tld.usd = '$' + Math.round(tld.amount / 100); //.toFixed(2);
  });

  return domains;
}

function getTldsAsync(opts) {
  var domains = getTldsHelper(opts);
  var p;

  if ((Date.now() - domains.updatedAt < (24 * 60 * 60 * 1000))) {
    return PromiseA.resolve(domains);
  }

  if (tldsPromise) {
    return tldsPromise;
  }

  p = tldsPromise = a3request({
    url: 'https://oauth3.org/api/com.enom.reseller/prices'
  }).then(function (tlds) {
    domains.tlds = tlds;
    domains.updatedAt = Date.now();

    writeCache(__dirname, domains, true);

    return mkdirpAsync(opts.cacheDir).then(function () {
      writeCache(opts.cacheDir, domains);

      tldsPromise = null;

      return domains;
    });
  });

  return p;
}

function getTlds(opts) {
  var domains = getTldsHelper(opts).tlds;
  getTldsAsync(opts);
  return domains;
}

module.exports.getTlds = getTlds;
module.exports.getTldsAsync = getTldsAsync;

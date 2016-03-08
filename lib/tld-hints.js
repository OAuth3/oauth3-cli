'use strict';

var colors = require('colors/safe');
var PromiseA = require('bluebird');
var requestAsync = PromiseA.promisify(require('request'));

var tldsPromise;

function getTldsAsync() {
  var domains = getTldsHelper();
  var p;

  if ((Date.now() - domains.updatedAt < (24 * 60 * 60 * 1000))) {
    return PromiseA.resolve(domains);
  }

  if (tldsPromise) {
    return tldsPromise;
  }

  p = tldsPromise = requestAsync({
    url: 'https://oauth3.org/api/com.enom.reseller/prices'
  }).then(function (req) {
    var tlds = JSON.parse(req.body);
    var path = require('path');
    var fs = require('fs');

    domains.tlds = tlds;
    domains.updatedAt = Date.now();

    // write new good
    try {
      fs.writeFileSync(path.join(__dirname, 'domains.json.tmp1'), JSON.stringify(domains), 'utf8');
    } catch(e) { console.error(e); }
    try {
      fs.writeFileSync(path.join(__dirname, 'domains.json.tmp2'), JSON.stringify(domains), 'utf8');
    } catch(e) { console.error(e); }

    try {
      // unlink if not broken
      fs.unlinkSync(path.join(__dirname, 'domains.json.bak'));
    } catch(e) { console.error(e); }
    try {
      // rename good to .bak
      fs.renameSync(path.join(__dirname, 'domains.json.tmp2'), path.join(__dirname, 'domains.bak.json'));
    } catch(e) { console.error(e); }

    try {
      // unlink if not broken
      fs.unlinkSync(path.join(__dirname, 'domains.json'));
    } catch(e) { console.error(e); }
    try {
      // rename good to .bak
      fs.renameSync(path.join(__dirname, 'domains.json.tmp1'), path.join(__dirname, 'domains.json'));
    } catch(e) { console.error(e); }

    tldsPromise = null;

    return domains;
  });

  return p;
}

function getTldsHelper() {
  var domains;

  try {
    domains = require('./domains.json');
  } catch(e) {
    try {
      domains = require('./domains.bak.json');
    } catch(e) {
      domains = domains || { updatedAt: 0, tlds: [] };
    }
  }

  domains.tlds = domains.tlds.filter(function (tld) {
    return tld.amount
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

function getTlds() {
  var domains = getTldsHelper().tlds;
  getTldsAsync();
  return domains;
}

function formatDomainSearch(state) {
  state.dnSearch = state.dnSearch || {};
  var tlds = getTlds();
  var  parts;
  var sld;
  var tldname;
  var lastTlds = tlds.slice(0);
  var currentTlds = tlds.slice(0);
  var tldPart = '';
  var input = '';
  var part = '';
  var complete = '';
  var suggestedTld;
  var altTlds = '';
  var exactTld;
  var searchable;

  tlds.sort(function (a, b) {
    // should sort thusly:
    // '' -> com ...                      (com, cheapest)
    // 'c' -> com co cool courses coupon  (com, c + cheapest)
    // 'co' -> com co cool courses coupon (com, co + cheapest) (exact match after filtering)
    // 'cou' -> courses coupon            (cou + cheapest + lex)
    var diff = a.tld.length - b.tld.length;
    if (diff) {
      return diff;
    }
    return a.tld > b.tld;
  });

  // TODO allow utf8 / punycode
  state.input = state.input.replace(/[^a-zA-Z0-9\.\-]/g, '').toLowerCase();
  parts = state.input.split('.');
  sld = parts.shift();
  tldname = parts.join('.');

  tldname.split('').some(function (ch) {
    tldPart += ch;
    lastTlds = currentTlds.slice(0);
    currentTlds = currentTlds.filter(function (tld) {
      if (tldname === tld.tld) {
        exactTld = tld;
        return false;
      }
      return 0 === tld.tld.indexOf(tldPart);
    });
    if (!exactTld && 0 === currentTlds.length) {
      tldname = tldPart.slice(0, -1);
      return true;
    }
  });
  state.input = sld + (parts.length > 0 ? '.' : '') + tldname;

  if (!currentTlds.length) {
    currentTlds = lastTlds;
  }
  if (!/\./.test(tldPart)) {
    currentTlds = currentTlds.filter(function (tld) {
      return !/\./.test(tld.tld);
    });
  }
  currentTlds.sort(function (a, b) {
    var costdiff = Math.round((a.amount - b.amount) / 100);
    var lendiff = a.tld.length - b.tld.length;

    if ('com' === a.tld) {
      return -10000;
    }
    if ('com' === b.tld) {
      return 10000;
    }
    if ('org' === a.tld) {
      return -9000;
    }
    if ('org' === b.tld) {
      return 9000;
    }
    if ('net' === a.tld) {
      return -8000;
    }
    if ('net' === b.tld) {
      return 8000;
    }

    if (costdiff) {
      return costdiff;
    }
    if ((a.length >= 4 || b.length >= 4) && lendiff) {
      return lendiff;
    }
    return a.tld > b.tld;
  });
  //console.log(currentTlds.slice(0, 5).map(function (tld) { return tld.tld + ':' + tld.amount; }));

  input = state.input;

  if (exactTld) {
    suggestedTld = exactTld;
    searchable = sld + '.' + tldname;
  } else {
    suggestedTld = currentTlds.shift() || { tld: '' };
  }
  if (state.dnSearch[searchable]) {
    state.dnSearch[searchable].usd = state.dnSearch[searchable].usd || suggestedTld.usd;
    suggestedTld = state.dnSearch[searchable];
  }

  complete += colors.bold(input);
  //complete += colors.dim('');

  if (tldname || '.' === state.input[state.input.length - 1]) {
    part = suggestedTld.tld.substr(tldname.length);
    state.hint = input + part;
  } else {
    part = '    (.' + suggestedTld.tld;
    state.hint = '';
  }

  complete += colors.dim(part);

  if (suggestedTld.tld) {
    part += ' ' + suggestedTld.usd;
    if (suggestedTld.na) {
      complete += ' ' + colors.red(suggestedTld.usd);
    }
    else if (suggestedTld.available) {
      complete += ' ' + colors.cyan(suggestedTld.usd);
    }
    else if (exactTld) {
      complete += ' ' + colors.dim(suggestedTld.usd.replace(/./g, '-'));
      //complete += ' ' + suggestedTld.usd;
    }
    else {
      complete += ' ' + suggestedTld.usd;
    }
    currentTlds.some(function (tld) {
      altTlds = ' | .' + tld.tld + ' ' + tld.usd;
      if ((state.prompt + input + part + altTlds).length >= (state.width || 80)) {
        return;
      }
      part += altTlds;
      complete += colors.dim(altTlds);
      //complete += altTlds;
    });
  }
  if (!(tldname || '.' === state.input[state.input.length - 1])) {
    part += ')';
    complete += colors.dim(')');
    //complete += ')';
  }
  //complete = colors.bold(input) + colors.dim(part);

  return {
    complete: complete
  , hintlen: part.length
  , searchable: searchable
  , sld: sld
  , tld: tldname
  };
}

module.exports.format = formatDomainSearch;
module.exports.getTlds = getTlds;
module.exports.getTldsAsync = getTldsAsync;

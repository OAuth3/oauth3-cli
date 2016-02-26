'use strict';

var colors = require('colors/safe');
var PromiseA = require('bluebird');
var requestAsync = PromiseA.promisify(require('request'));

var tldsPromise;
function getTlds() {
	var domains = require('./lib/domains.json');

  /*
	if (!tldsPromise && (Date.now() - domains.updatedAt < (24 * 60 * 60 * 1000))) {
		tldsPromise = requestAsync({
      url: 'https://oauth3.org/api/com.enom.reseller/prices'
    }).then(function (req) {
      console.log('getTlds', typeof req.body);
      //console.log(req.body);
      domains = JSON.parse(req.body);
		});
	}
  */

  domains.tlds = domains.tlds.filter(function (tld) {
    return tld.amount && -1 === ['xxx', 'sex', 'adult', 'porn'].indexOf(tld);
  });
  domains.tlds.forEach(function (tld) {
    tld.usd = '$' + Math.round(tld.amount / 100); //.toFixed(2);
  });
  return domains.tlds;
}

function formatDomainSearch(state) {
  var tlds = getTlds();
  // http://stackoverflow.com/questions/72768/how-do-you-detect-credit-card-type-based-on-number
	var	parts;
  var sld;
  var tldname;
  var lastTlds;
  var currentTlds = tlds;
  var tldPart = '';
  var input = '';
  var part = '';
  var complete = '';
  var suggestedTld;
  var altTlds = '';
  var exactTld;

  tlds.sort(function (a, b) {
    // TODO
    // currently sorts length and lex:
    // '' -> abc ... cats com computer ... xzy
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

  //console.log('sld', sld);
  //console.log('tld', tld);
  tldname.split('').some(function (ch) {
    tldPart += ch;
    //console.log('tldPart', tldPart);
    lastTlds = currentTlds;
    currentTlds = currentTlds.filter(function (tld) {
      if (tldname === tld.tld) {
        exactTld = tld;
        return false;
      }
      return 0 === tld.tld.indexOf(tldPart);
    });
    if (0 === currentTlds.length) {
      return true;
    }
  });

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
  } else {
    suggestedTld = currentTlds.shift() || { tld: '' };
  }
  if (tldname || '.' === state.input[state.input.length - 1]) {
    part = suggestedTld.tld.substr(tldname.length);
  } else {
    part = '    (.' + suggestedTld.tld;
  }
  complete = colors.bold(input) + colors.dim(part);

  if (suggestedTld.tld) {
    complete += colors.dim(' ' + suggestedTld.usd);
    currentTlds.some(function (tld) {
      altTlds = ' | .' + tld.tld + ' ' + tld.usd;
      if ((state.prompt + complete + altTlds).length >= 80) {
        return;
      }
      complete += altTlds;
    });
  }
  if (!(tldname || '.' === state.input[state.input.length - 1])) {
    complete += ')';
  }

  /*
  ws.cursorTo(0);
  writePrompt(ws, state);
  ws.write(complete);
  ws.moveCursor(-1 * part.length, 0);
  */
  return complete;
}

//var state = { input: '', prompt: 'Search Domain > ' };
//var state = { input: 'coolaj86', prompt: 'Search> ' };
//var state = { input: 'coolaj86.', prompt: 'Search> ' };
//var state = { input: 'coolaj86.c', prompt: 'Search> ' };
//var state = { input: 'coolaj86.co', prompt: 'Search> ' };   // exact match
//var state = { input: 'coolaj86.com', prompt: 'Search> ' };
//var state = { input: 'coolaj86.comp', prompt: 'Search> ' };
//var state = { input: 'coolaj86.compa', prompt: 'Search> ' };
var state = { input: 'coolaj86.cou', prompt: 'Search> ' };
var tlds = formatDomainSearch(state);
console.log(state.prompt + tlds);

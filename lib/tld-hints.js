'use strict';

var colors = require('colors/safe');
var PromiseA = require('bluebird');
var requestAsync = PromiseA.promisify(require('request'));

var tldsPromise;
function getTlds() {
  var domains;

  try {
    domains = require('./domains.json');
  } catch(e) {
    domains = require('./domains.json.bak');
  }
  domains = domains || { updatedAt: 0, tlds: [] };

	if (!tldsPromise && (Date.now() - domains.updatedAt > (24 * 60 * 60 * 1000))) {
		tldsPromise = requestAsync({
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
        fs.renameSync(path.join(__dirname, 'domains.json.tmp2'), path.join(__dirname, 'domains.json.bak'));
      } catch(e) { console.error(e); }

      try {
        // unlink if not broken
        fs.unlinkSync(path.join(__dirname, 'domains.json'));
      } catch(e) { console.error(e); }
      try {
        // rename good to .bak
        fs.renameSync(path.join(__dirname, 'domains.json.tmp1'), path.join(__dirname, 'domains.json'));
      } catch(e) { console.error(e); }
		});
	}

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
      tldname = tldPart.substr(0, tldPart.length - 1);
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
  } else {
    suggestedTld = currentTlds.shift() || { tld: '' };
  }
  if (tldname || '.' === state.input[state.input.length - 1]) {
    part = suggestedTld.tld.substr(tldname.length);
  } else {
    part = '    (.' + suggestedTld.tld;
  }
  state.hint = input + part;
  complete = colors.bold(input) + colors.dim(part);

  if (suggestedTld.tld) {
    complete += colors.dim(' ' + suggestedTld.usd);
    currentTlds.some(function (tld) {
      altTlds = ' | .' + tld.tld + ' ' + tld.usd;
      if ((state.prompt + complete + altTlds).length >= (state.width || 80)) {
        return;
      }
      complete += altTlds;
    });
  }
  if (!(tldname || '.' === state.input[state.input.length - 1])) {
    complete += ')';
  }

  return {
    complete: complete
  , hintlen: complete.length - input.length
  };
}

function tldAutocomplete(ws, state) {
  state.input = state.hint;
  ws.cursorTo(0);
  writePrompt(ws, state);
  ws.write(complete);
  /*
  ws.cursorTo(0);
  writePrompt(ws, state);
  ws.write(complete);
  ws.moveCursor(-1 * part.length, 0);
  */
}

//var state = { input: '', prompt: 'Search Domain > ' };
//var state = { input: 'coolaj86', prompt: 'Search> ' };
//var state = { input: 'coolaj86.', prompt: 'Search> ' };
//var state = { input: 'coolaj86.c', prompt: 'Search> ' };
//var state = { input: 'coolaj86.co', prompt: 'Search> ' };   // exact match
//var state = { input: 'coolaj86.com', prompt: 'Search> ' };
//var state = { input: 'coolaj86.comp', prompt: 'Search> ' };
//var state = { input: 'coolaj86.compa', prompt: 'Search> ' };
//var state = { input: 'coolaj86.cou', prompt: 'Search> ', width: 110 };
//var state = { input: 'coolaj86.cxtzmmr', prompt: 'Search> ', width: 110 };
//console.log(state.input);
var tlds = formatDomainSearch(state);
console.log(state.prompt + tlds.complete);
//console.log(state.input);

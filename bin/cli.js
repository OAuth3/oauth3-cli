'use strict';

var PromiseA = require('bluebird');
var path = require('path');
var cli = require('cli');
var colors = require('colors/safe');
var authenticator = require('authenticator');
var qrcode = require('qrcode-terminal');
var A = require('../');
var A3 = require('../lib/utils');
var jwt = require('jsonwebtoken');
//var stripe = require('./lib/stripe');
var stripeId = 'pk_test_kSiUE4kP4c4ZdnkCjAwORASs';
var stripe = require('stripe')(stripeId);

var BKSP = String.fromCharCode(127);
var ENTER = "\u0004";           // 13 // '\u001B[0m'
var CTRL_C = "\u0003";
var TAB = '\x09';
var ARROW_UP = '\u001b[A';      // 38
var ARROW_DOWN = '\u001b[B';    // 40
var ARROW_RIGHT = '\u001b[C';   // 39
var ARROW_LEFT = '\u001b[D';    // 37

// https://www.novell.com/documentation/extend5/Docs/help/Composer/books/TelnetAppendixB.html
var code = [
  ['u', 'w', 'i']
, ['u', 'w', 'i']
, ['d', 's', 'k']
, ['d', 's', 'k']
, ['l', 'a', 'j']
, ['r', 'd', 'l']
, ['l', 'a', 'j']
, ['r', 'd', 'l']
, ['b']
, ['a']
, [' ']
];
var state = {
  state: 'loading'
, msgs: ['...']
, codes: ''
, debugs: []
};
var tooSmall = false;

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

function clearScreen(ws) {
  // We could use `process.stdout.write('\x1Bc');`
  // but that would send the clear screen signal,
  // which would cause the screen to scroll in the
  // history. Instead we want to blank the current
  // screen in-place.
  var cols = ws.columns;
  var rows = ws.rows;
  var line = (new Array(cols + 1)).join(' ') + '\n';

  ws.cursorTo(0, 0);
  (new Array(rows).join('x').split('x')).forEach(function () {
    ws.write(line);
  });
}

function writeMenu(ws, state) {
  var cols = ws.columns;
  var rows = ws.rows;
  var line = (new Array(cols + 1)).join(' ') + '\n';
  var size = state.codes.split('').map(function () {
    return '█';
  }).join('') + ' [' + cols + 'x' + rows + ']';
  var msg = "OAuth3";

  // Header
  ws.cursorTo(0, 0);
  ws.write(msg + (line.slice(0, cols - (msg.length + size.length))) + size);
  ws.write(line.replace(/./g, '-'));

  // Footer
  ws.cursorTo(0, rows - 2);
  ws.write(line.replace(/./g, '-'));

  ws.cursorTo(0, rows - 1);
  writePrompt(ws, state);
}

// excuse me. EXCUSE ME. SECURDY SE-CURDY.
// We got a complicated terminal
function dollarBillCheck(stream) {
  var cols = stream.columns;
  var rows = stream.rows;

  if (cols >= 80 && rows >= 24) {
    // This will DESTROY the OCD
    // There will be no survivors!!!
    // (as soon as you get the size right, the message goes away)
    if (tooSmall) {
      tooSmall = false;
    }
    return true;
  }

  if (tooSmall) {
    return false;
  }

  clearScreen(stream);
  stream.write("Did you know that the 80x24 terminal was modeled after the size of a dollar bill?\n");  // 2
  stream.write("FACT: http://programmers.stackexchange.com/q/148677\n");                                // 1
  stream.write("\n\n\n\n\n\n\n\n");                                                                     // 8
  stream.write("\n\n\n\n\n\n\n\n");                                                                     // 8
  stream.write("And do you know who doesn't support terminals smaller than a 1890 US dollar bill?\n");  // 2
  stream.write("FACT: us\n");                                                                           // 2
  // SIZE MATTERS, it's not just how you use it!
  // prompt shows up as final line
}

function say(ws, state, msgs, y) {
  var cols = ws.columns;
  var rows = ws.rows;

  if (!msgs) {
    msgs = state.msgs;
  }
  if (!y && 0 !== y) {
    y = Math.ceil(rows / 2) - Math.floor(msgs.length / 2);
  }

  msgs.forEach(function (msg) {
    var x = Math.floor(cols / 2) - Math.floor(msg.length / 2);
    ws.cursorTo(x, y);
    ws.write(msg);
    y += 1;
  });

  ws.cursorTo(0, cols);
}

function qr(ws, state) {
  var cols = ws.columns;
  //var rows = ws.rows;
  var x = 3; // padding
  var y = 3; // headers

  ws.cursorTo(x, y);

  state.msgs.forEach(function (msg) {
    if ('__RAW__' === msg) {
      ws.cursorTo(0, y);
      ws.write(state.qr);
      y += state.qr.split('\n').length;
    } else {
      ws.cursorTo(x, y);
      ws.write(msg);
      y += 1;
    }
  });

  ws.cursorTo(0, cols);
}

function reCompute(ws, state) {
  clearScreen(ws, state);
  // TODO check needed w x h
  if (!dollarBillCheck(ws, state)) {
    return;
  }
  if ('qr' === state.state) {
    qr(ws, state);
  } else {
    say(ws, state);
  }
  writeMenu(ws, state);
}

function checkCodes(ws, state) {
  var nextChars = code[state.codes.length] || [];
  var ch = state.ch;

  switch (ch) {
  case ENTER:
    ch = ' ';
    break;
  case ARROW_UP:
    ch = 'w';
    break;
  case ARROW_DOWN:
    ch = 's';
    break;
  case ARROW_LEFT: // TODO handle left
    ch = 'a';
    break;
  case ARROW_RIGHT:
    ch = 'd';
    break;
  default:
    break;
  }

  if (-1 === nextChars.indexOf(ch)) {
    state.codes = '';
    reCompute(ws, state);
    return;
  }

  state.codes += ch;
  writeMenu(ws, state);
  if (code.length === state.codes.length) {
    state.state = '!!!';
    state.msgs = [colors.trap('!!!')];
    say(ws, state);
    return;
  }
}

function hint(ws, state) {
  var start;
  var part;
  var complete;

  if (!state.hint) {
    ws.write(state.input);
    return;
  }

  start = state.input;
  part = state.hint.slice(start.length);
  complete = colors.bold(start) + colors.dim(part);

  //ws.clearLine();
  ws.cursorTo(0);
  writePrompt(ws, state);
  ws.write(complete);
  ws.moveCursor(-1 * part.length, 0);
}

function search(ws, state) {
  var hints = state.hints.filter(function (provider) {
    //return provider.toLowerCase().match(new RegExp(escapeRe('^' + state.input)));
    return (state.input || state.autohint) && 0 === provider.toLowerCase().indexOf(state.input);
  });

  state.hint = hints[0] || '';
  hint(ws, state);
}

function getEmailHints(input) {
  // TODO also include known providers (oauth3.org, facebook.com, etc)
  // and previously used email addresses
  var provider = input.replace(/.*@/, '').toLowerCase();

  if (input.length < 3) {
    return [];
  }

  return [
    'gmail.com'
  , 'yahoo.com'
  , 'ymail.com'
  , 'outlook.com'
  , 'hotmail.com'
  , 'live.com'
  , 'msn.com'
  , 'yandex.com'
  , 'aol.com'
  , 'icloud.com'
  , 'me.com'
  , 'mail.com'
  , 'gmx.com'
  , 'inbox.com'
  , 'lycos.com'
  , 'zoho.com'
  , 'hushmail.com'
  , 'hushmail.me'
  , 'hush.com'
  , 'hush.ai'
  , 'mac.hush.com'
  ].filter(function (str) {
    return 0 === str.indexOf(provider);
  }).map(function (str) {
    if (!provider) {
      return input.replace(/@/, '') + '@' + str;
    }
    return input + str.substr(provider.length);
  });
}

function getCcRule(num) {
	var rule = {
		name: 'Credit Card'
  , abbr: 'unknown'
	, format: 'xxxx-xxxx-xxxx-yyyy'
  , cvc: 'xxx'
	};
	var defaultRule = rule;
  var ccs = [
		{ abbr: 'electron'
		, name: 'Electron'
		, re: /^(4026|417500|4405|4508|4844|4913|4917)\d+$/
		}
	, { abbr: 'maestro'
		, name: 'Maestro'
		, re: /^(5018|5020|5038|5612|5893|6304|6759|6761|6762|6763|0604|6390)\d+$/
		}
	, { abbr: 'dankort'
		, name: 'Dankort'
		, re: /^(5019)\d+$/
		}
	, { abbr: 'interpayment'
		, name: 'InterPayment'
		, re: /^(636)\d+$/
		}
	, { abbr: 'unionpay'
		, name: 'UnionPay'
		, re: /^(62|88)\d+$/
		}
	, { abbr: 'visa'
		, name: 'Visa'
		, re: /^4[0-9]{0,12}(?:[0-9]{3})?$/
		, format: 'xxxx-xxxx-xxxx-yyyy'
		}
	, { abbr: 'mastercard'
		, name: 'MasterCard'
		, re: /^5[1-5][0-9]{0,14}$/
		, format: 'xxxx-xxxx-xxxx-yyyy'
		}
	, { abbr: 'amex'
		, name: 'American Express'
		, re: /^3[47][0-9]{0,13}$/
		, format: 'xxxx-xxxxxx-xyyyy'
    , cvc: 'xxxx'
		}
	, { abbr: 'diners'
		, name: 'Diners Club'
		, re: /^3(?:0[0-5]|[68][0-9])[0-9]{0,11}$/
		}
	, { abbr: 'discover'
		, name: 'Discover'
		, re: /^6(?:011|5[0-9]{2})[0-9]{0,12}$/
		, format: 'xxxx-xxxx-xxxx-yyyy'
		}
	, { abbr: 'jcb'
		, name: 'JCB'
		, re: /^(?:2131|1800|35\d{3})\d{0,11}$/
		}
  ];
	var maxlen = ccs.reduce(function (max, dir) { return Math.max(max, dir.name.length); }, 0) + 1;

	num = num.replace(/\D/g, '');
	ccs.some(function (_rule) {
		if (_rule.re.test(num)) {
			rule = _rule;
			return true;
		}
	});
	rule.format = rule.format || defaultRule.format;
	rule.cvc = rule.cvc || defaultRule.cvc;
  rule.maxlen = maxlen;

  return rule;
}

function formatCcNumber(ws, state) {
  // http://stackoverflow.com/questions/72768/how-do-you-detect-credit-card-type-based-on-number
  var rule = getCcRule(state.input);
	var	arr;
	var prevc;
	var complete;
	var part;
	var input = '';

	state.input = state.input.replace(/\D/g, '');

  state.ccRule = rule;

	arr = state.input.split('');
	rule.format.split('').forEach(function (ch) {
		var c;

		if ('x' === ch || 'y' === ch) {
 			c = arr.shift();
			if ('y' === ch || state.unmask || !arr.length) {
				input += (c && c || '');
			} else {
				input += (c && '*' || '');
			}
		}
		else if ('-' === ch) {
			if (prevc) {
				input += ch;
			}
		}
		else {
			console.error('Internal Error (not your fault): Unexpected Card Format: ' + rule.format);
			process.exit(1);
		}

		prevc = c;
	});
  if (arr.length) {
    input += '-' + arr.join('');
  }

	part = rule.format.substr(input.length);
  complete = colors.bold(input) + colors.dim(part.replace(/y/g, 'x'));
	state.prompt = rule.name;
	while (state.prompt.length < rule.maxlen) {
		state.prompt += ' ';
	}

  ws.cursorTo(0);
  writePrompt(ws, state);
  ws.write(complete);
  ws.moveCursor(-1 * part.length, 0);
}

function formatCcExp(ws, state) {
  // TODO enforce that the expiration must be no sooner than yesterday
  // (this should account for international date drift)
  // TODO enforce
	var	arr;
	var prevc;
	var complete;
	var part;
	var input = '';
  var format = 'mm/yy';
  var month = 0;

  //  '0' -> 0
  //  '1' -> 1
  //  '2' -> 02
  // '1/' -> 01
  // '13' -> 1
  if (/0-9/.test(state.input[0]) && '/' === state.input[1]) {
    state.input = '0' + state.input;
  }
	state.input = state.input.replace(/\D/g, '');
  if (state.input[0] > 1) {
    state.input = '0' + state.input;
  }
  month = parseInt(state.input.substr(0, 2), 10) || 0;
  if (month < 1 || month > 12) {
    state.input = state.input[0] || '';
  }
  state.input = state.input.substr(0, 4);

	arr = state.input.split('');
	format.split('').forEach(function (ch) {
		var c;

		if ('m' === ch || 'y' === ch) {
 			c = arr.shift();
			if (state.unmask || !arr.length) {
				input += (c && c || '');
			} else {
				input += (c && '*' || '');
			}
		}
		else if ('/' === ch) {
			if (prevc) {
				input += ch;
			}
		}
		else {
			console.error('Internal Error (not your fault): Unexpected Expiration Format: ' + format);
			process.exit(1);
		}

		prevc = c;
	});
  if (arr.length) {
    input += '/' + arr.join('');
  }

	part = format.substr(input.length);
  complete = colors.bold(input) + colors.dim(part);

  ws.cursorTo(0);
  writePrompt(ws, state);
  ws.write(complete);
  ws.moveCursor(-1 * part.length, 0);
}

function formatCcCvc(ws, state) {
  var rule = state.ccRule;
	var	arr;
	var prevc;
	var complete;
	var part;
	var input = '';

	state.input = state.input.replace(/\D/g, '');

	arr = state.input.split('');
	rule.cvc.split('').forEach(function (ch) {
		var c;

		if ('x' === ch) {
 			c = arr.shift();
			if (state.unmask || !arr.length) {
				input += (c && c || '');
			} else {
				input += (c && '*' || '');
			}
		}
		else {
			console.error('Internal Error (not your fault): Unexpected CVC Format: ' + rule.cvc);
			process.exit(1);
		}

		prevc = c;
	});

  if (arr.length) {
    if (state.unmask) {
      input += arr.join('');
    } else {
      input += arr.map(function () { return '*'; }).join('');
    }
  }

	part = rule.cvc.substr(input.length);
  complete = colors.bold(input) + colors.dim(part);

  ws.cursorTo(0);
  writePrompt(ws, state);
  ws.write(complete);
  ws.moveCursor(-1 * part.length, 0);
}

function handleCcNumber(ws, state, cb) {
  state.isSecret = true;
	state.inputCallback = formatCcNumber;

  handleInput(ws, state, function (err, result) {
    state.isSecret = false;
		state.inputCallback = null;
    cb(err, result);
  });

  // pre-fill suggestion
	state.inputCallback(ws, state);
}

function handleCcExp(ws, state, cb) {
  state.isSecret = true;
	state.inputCallback = formatCcExp;

  handleInput(ws, state, function (err, result) {
    state.isSecret = false;
		state.inputCallback = null;
    cb(err, result);
  });

  // pre-fill suggestion
	state.inputCallback(ws, state);
}

function handleCcCvc(ws, state, cb) {
  state.isSecret = true;
	state.inputCallback = formatCcCvc;

  handleInput(ws, state, function (err, result) {
    state.isSecret = false;
		state.inputCallback = null;
    cb(err, result);
  });

  // pre-fill suggestion
	state.inputCallback(ws, state);
}

function handleSecret(ws, state, cb) {
  state.isSecret = true;
  handleInput(ws, state, function (err, result) {
    state.isSecret = false;
    cb(err, result);
  });
}

function handleInput(ws, state, cb) {
  var stdin = process.stdin;

  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.resume();

  state.input = state.input || '';
  state.hint = '';

  reCompute(ws, state);

  function callback(err, result) {
    stdin.removeListener('data', onData);

    stdin.setRawMode(false);
    stdin.pause();

    state.input = '';
    state.hint = '';

    cb(err, result);
  }

  function onData(ch) {

    state.ch = ch.toString('utf8');
    ch = '';
    checkCodes(ws, state);

    switch (state.ch) {
    case "\n":
    case "\r":
    case ENTER:
        if (state.hint) {
          state.input += state.hint.slice(state.input.length);
        }
        callback(null, state.input);
        return;
        //break;
    case CTRL_C:
        console.log("");
        console.log("received CTRL+C and quit");
        process.exit(0);
        callback(new Error("cancelled"));
        break;
    case BKSP:
        state.input = state.input.slice(0, state.input.length - 1);
        break;
    case ARROW_UP:
        if (state.isSecret) {
          state.unmask = true;
        }
        break;
    case ARROW_DOWN:
        if (state.isSecret) {
          state.unmask = false;
        }
        break;
    case ARROW_LEFT: // TODO handle left
        break;
    case TAB:
    case ARROW_RIGHT:
        if (!state.isSecret && state.hint) {
          ch = state.hint.slice(state.input.length);
        }
        break;
    default:
        // TODO check for utf-8 non-control characters
        ch = state.ch;
        break;
    }

    // More passsword characters
    //process.stdout.write('*');
    state.input += ch;

    if (state.inputCallback) {
      state.inputCallback(ws, state);
      return;
    }

    if (!state.isSecret) {
      search(ws, state);
      return;
    }

    writeSecret(ws, state);
  }

  stdin.on('data', onData);
}

function writePrompt(ws, state) {
  // Prompt
  var prompt = state.prompt || '> ';

  if (state.isSecret) {
    if (state.unmask) {
      prompt += '(↓ to hide)';
    } else {
      prompt += '(↑ to show)';
    }
    prompt += ': ';
  }

  ws.write(prompt);
}

function writeSecret(ws, state) {
  var input;

  ws.cursorTo(0);
  writePrompt(ws, state);
  // TODO support utf8
  if (state.unmask) {
    input = state.input;
  } else {
    input = state.input.split('').map(function () {
      return '*';
    }).join('');
  }

  ws.write(input);
}

function getProviderName(ws, state, cb) {
  state.state = 'welcome';
  state.hints = A.providers;
  state.msgs = [
    "Welcome!"
  , "It looks like you don't have any stored credentials or profiles."
  , ""
  , "Where would you like to create an account?"
  , ""
  ];
  A.providers.sort().forEach(function (provider) {
    state.msgs.push("• " + provider);
  });
  state.msgs.push('');
  state.msgs.push('Type the name of one of the account providers above (or any of your choosing)');
  state.error = null;
  state.prompt = '> ';

  // TODO allow commandline argument for provider
  handleInput(ws, state, function (err, input) {
    if (!input) {
      state.error = "";
      getProviderName(ws, state, cb);
    }

    state.providerUrl = input;
    cb(null);
  });
}

function getId(ws, state, cb) {
  state.state = 'login';
  state.msgs = [
    "Login Time!"
  , ""
  ];
  Object.keys(state.oauth3).forEach(function (key) {
    var dir = state.oauth3[key];

    if (dir.method) {
      state.msgs.push(key + " [" + dir.method + "] " + dir.url);
    }
  });
  state.msgs.push('');
  state.msgs.push('');
  state.msgs.push('');
  state.msgs.push("Type your email for " + state.providerUrl + ":");

  state.error = null;

  handleInput(ws, state, function (err, userId) {
    state.username = userId;

    cb(null);
  });
}

function getProviderDirectives(ws, state, cb) {
  return A3.discover(state.providerUrl).then(function (results) {
    state.oauth3 = results;
    cb(null);
  });
}

function getCredentialMeta(ws, state, cb) {
  return A3.getCredentialMeta(state.oauth3, state.username).then(function (results) {
    if (!results) {
      console.error('[Error]: Sanity Check Fail: no result');
      process.exit(0);
      return;
    }

    if (results.kdf) {
      state.userMeta = results;
      cb(null);
      return;
    }

    if (results.error) {
      //console.log('[oauth3-cli] DEBUG getCredentialMeta');
      //console.log(results);
      //process.exit(1);

      // TODO results.code
      if (/not exist/.test(results.error.message || results.error.description)) {
        state.userMeta = {};
        cb(null);
        return;
      }
    }

    console.error('[Error]: Sanity Check Fail: unusual result');
    console.error(results);
    process.exit(0);
  });
}

function getToken(ws, state, cb) {
  state.state = 'token';
  state.msgs = [
    "Enter your Two-Factor Auth Code"
  , ""
  , "(you can skip by leaving the code blank)"
  ];
  state.prompt = 'Authenticator 6-digit token: ';

  handleInput(ws, state, function (err, token) {
    state.totpToken = token || false;

    cb(null);
  });
}

function createSecret(ws, state, cb) {
  state.state = 'secret';
  state.msgs = [
    "Now it's time to create a passphrase"
  , ""
  , "Choose something 16 characters or more"
  ];
  state.prompt = 'Enter your Passphrase ';

  handleSecret(ws, state, function (err, secret) {
    state.secret = secret;

    cb(null);
  });
}

function getCcEmail(ws, state, cb) {
  state.state = 'email';
  state.autohint = true;
  state.hints = state.username && [state.username] || getEmailHints(state.input);
  state.msgs = [
    "Email Address for Credit Card"
  , ""
  , ""
  , ""
  ];
  state.error = null;
  state.prompt = 'Email Address: ';

  state.inputCallback = function (ws, state) {
    state.hints = getEmailHints(state.input);
    if (/@/.test(state.username)) {
      state.hints.unshift(state.username);
    }
    search(ws, state);
  };
  handleInput(ws, state, function (err, result) {
    state.inputCallback = null;
    state.autohint = false;

    if (!result) {
      state.error = "";
      getCcEmail(ws, state, cb);
    }

    state.email = result;
    cb(err, result);
  });

  search(ws, state);
}

function getCcNumber(ws, state, cb) {
  if (state.ccNumber) {
    state.input = state.ccNumber.toString();
  }
  state.state = 'cc';
  state.msgs = [
    "Credit Card Number"
  , ""
  , "You card information will be stored SECURE and encrypted with Stripe.com"
  , "it WILL NOT BE SAVED on this computer or our servers"
  ];
  state.prompt = 'Card Number      ';
  //state.prompt = 'American Express ';

  handleCcNumber(ws, state, cb);
}

function getCcExp(ws, state, cb) {
  if (state.ccExp) {
    state.input = state.ccExp.toString();
  }
  state.state = 'cc';
  state.msgs = [
    "Credit Card Expiration Date"
  , ""
  , "You card information will be stored SECURE and encrypted with Stripe.com"
  , "it WILL NOT BE SAVED on this computer or our servers"
  ];
  state.prompt = 'Expiration Date ';

  handleCcExp(ws, state, cb);
}

function getCcCvc(ws, state, cb) {
  if (state.ccCvc) {
    state.input = state.ccCvc.toString();
  }
  state.state = 'cc';
  state.msgs = [
    "Credit Card Verification Number (CVC)"
  , ""
  , "You card information will be stored SECURE and encrypted with Stripe.com"
  , "it WILL NOT BE SAVED on this computer or our servers"
  ];
  state.prompt = 'CVC ';

  handleCcCvc(ws, state, cb);
}

function createCreditCard(ws, state, cb) {
  state.unmask = true;
  getCcNumber(ws, state, function (err, num) {
    getCcExp(ws, state, function (err, exp) {
      getCcCvc(ws, state, function (err, cvc) {
        state.unmask = true;
        getCcEmail(ws, state, function (err, email) {
          stripe.tokens.create({
            card: {
              number: num
            , exp_month: exp.substr(0, 2)
            , exp_year: '20' + exp.substr(2, 2)
            , cvc: cvc
            }
          }).then(function (token) {
            A.createCustomer(token);
          }).then(function (result) {
            cb(null, result);
          }, function (err) {
            cb(err);
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
    });
  });

}

function getSecret(ws, state, cb) {
  state.state = 'secret';
  state.msgs = [
    "Now it's time to enter your passphrase"
  ];
  state.prompt = 'Create a Passphrase ';

  handleSecret(ws, state, function (err, secret) {
    state.secret = secret;

    cb(null);
  });
}

function createCredential(ws, state, cb) {
  // TODO standardize account creation
  A3.createCredential(state.oauth3, {
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
    cb(null);
  }, function (err) {
    console.error('[oauth3-cli] Error createCredential');
    console.error(err.stack);
    console.error(err.result);
    process.exit(0);
  });
}

function createQr(ws, state, cb) {
  var url;

  state.totpRetry = state.totpRetry || 0;
  state._totpKey = state._totpKey || authenticator.generateKey();

  // TODO providerName
  url = authenticator.generateTotpUri(
    state._totpKey, state.username.replace(/@.*/, ''), state.oauth3.provider_uri, 'SHA1', 6, 30
  );
  // TODO minimal option to exclude these defaults
  url = url
    .replace(/issuer=([^&]*)&?/, '')
    .replace(/digits=6&?/, '')
    .replace(/algorithm=SHA1&?/, '')
    .replace(/period=30&?/, '')
    .replace(/(&|\?)$/, '')
    ;
  state.state = 'qr';
  state.msgs = [
    "Create a New Account" + (state.totpRetry && (" (Take #" + (state.totpRetry + 1) + ")") || '')
  , ""
  ];

  qrcode.setErrorLevel('L'); // L: 7%, M: 15%, Q: 25%, H: 30%
  qrcode.generate(url, function (qr) {
    state.qr = qr;
    state.msgs.push('__RAW__');
  });

  state.msgs.push('');
  state.msgs.push("Download the Authy App at https://www.authy.com/app/");
  state.msgs.push('');
  state.msgs.push(url);
  state.msgs.push('');
  state.msgs.push("Type the 6-digit token below:");

  state.error = null;
  state.prompt = '6-digit Token: ';

  // TODO handle token as 000000 with delimeters '-', ' ', or '.'
  handleInput(ws, state, function (err, token) {
    if (!authenticator.verifyToken(state._totpKey, token)) {
      state.totpRetry += 1;
      createQr(ws, state, cb);
      return;
    }

    state.totpKey = state._totpKey;
    state.qr = null;
    state.state = '';
    cb(null, state.totpKey);
  });
}

function loginCredential(ws, state, cb) {
  A3.getProof(state.oauth3, state.userMeta, state.secret).then(function (proofstr) {
    return A3.requests.resourceOwnerPassword(state.oauth3, {
      id: state.username
    , secret: proofstr
    , scope: state.scope
    , totp: state.totpToken
    , appId: state.appId || state.providerUrl
    , clientAgreeTos: 'oauth3.org/tos/draft'
    , clientUri: 'oauth3.org'
    // , tenantId: 'oauth3.org' // TODO make server assume default tenant
    }).then(function (result) {
      var err;

      state.secret = null;  // ditto
      proofstr = null;      // garbage collect the secret faster
      if (result.error) {
        err = new Error(result.error.message || result.error_description);
        err.code = result.error.code || result.error;
        err.uri = result.error.uri || result.error_uri;
        err.result = result;

        return PromiseA.reject(err);
      }

      return result;
    }).then(function (result) {
      state.session = result;
      state.session.decoded = jwt.decode(state.session.accessToken);

      cb(null);
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
      //cb(err);
    });
  });
}

function testSession(ws, state, cb) {
  A3.requests.inspectToken(state.oauth3, state.session).then(function (/*result*/) {
    state.sessionTested = true;

    A.saveSession(state).then(function () {
      cb(null);
    });
  });
}

function getAccounts(ws, state, cb) {
  // TODO force account refresh
  var decoded = state.session.decoded;
  var accounts = decoded.axs || decoded.acs
    || (decoded.acx && [ { idx: decoded.acx } ])
    || (decoded.acc && [ { id: decoded.acc } ])
    ;

  if (accounts) {
    state.accounts = accounts;
    cb(null);
    return;
  }

  if (!state.oauth3.accounts) {
    console.log("[oauth3-cli] handle profile NOT IMPLEMENTED");
    process.exit(1);
    /*
    if (!state.oauth3.profile) {
    }
    */
  }

  A3.requests.accounts(state.oauth3, state.session).then(function (result) {
    state.accounts = result.accounts;
    cb(null);
  }, function (err) {
    console.error("[oauth3-cli] accounts Error:");
    console.error(err.stack || err);
    console.error(err.result);
    process.exit(1);
  });
}

function getAccount(ws, state, cb) {
  if (!state.accounts.length) {
    createAccount(ws, state, cb);
    return;
  }

  // TODO show selection menu
  state.account = state.accounts[0];
  cb(null);
}

function getEcho(ws, state, cb) {
  state.echo = true;
  A3.requests.echo(state.oauth3, state.session).then(function (result) {
    console.log(result);
    cb(null);
  });
}

function getCards(ws, state, cb) {
  state.card = true;
  A3.requests.cards(state.oauth3, state.session).then(function (results) {
    console.log('CARDS');
    console.log(results);
    if (results.length) {
      state.cards = results;
      cb(null);
      return results;
    }

    return createCreditCard(ws, state, function (err, card) {
			console.log('got card:', card);
			process.exit(1);
		});
/*
Cards.create({
      number: '4242424242424242'
    , cvc: '111'
    , month: '12'
    , year: '2020'
    , nick: 'coolaj86@gmail.com'
    });
    //A3.requests.saveCard();
*/
  });
}

function getExistingSession(ws, state, cb) {
  A.session(state).then(function (session) {
    var now;
    var then;

    if (!session) {
      cb(null);
      return;
    }

    now = Date.now();
    then = parseInt(session.session.decoded.exp, 10) * 1000;
    if (now < then) {
      state.accounts = session.accounts;
      state.userMeta = session.userMeta;
      state.session = session.session;

      cb(null);
      return;
    }

    return A3.requests.refreshToken(state.oauth3, {
      appId: state.appId || state.providerUrl
    , clientAgreeTos: 'oauth3.org/tos/draft'
    , clientUri: 'oauth3.org'
    //, scope: state.scope
    // , tenantId: 'oauth3.org' // TODO make server assume default tenant
    , refreshToken: session.session.refreshToken
    }).then(function (results) {
      results.refreshToken = results.refreshToken || session.session.refreshToken;

      state.accounts = null;
      state.account = null;

      state.session = results;
      state.session.decoded = jwt.decode(state.session.accessToken);

      cb(null);
    }, function (err) {
      console.error('[oauth3-cli] Refresh Token failure:');
      console.error(Object.keys(err));
      console.error(err);
      process.exit(1);
      cb(null);
    });
  });
}

function createAccount(ws, state, cb) {
  // TODO if (!state.nick) { getNick(ws, state, function () { ... }); }
  A3.requests.accounts.create(state.oauth3, state.session, {
    nick: state.nick
  , self: {
      comment: 'created by oauth3.org cli'
    }
  }).then(function (result) {
    state.session.accessToken = result.accessToken || result.access_token;
    state.session.decoded = jwt.decode(state.session.accessToken);

    state.accounts = null;
    state.account = result.account;

    cb(null);
  }, function (err) {
    console.error("[oauth3-cli] account Error:");
    console.error(err.stack || err);
    console.error(err.result);
    process.exit(1);
  });
}

function doTheDo(ws, state) {
  function loopit() {
    doTheDo(ws, state);
  }

  if (!state.configs) {
    loadProfiles(ws, state, loopit);
  }
  else if (!state.device) {
    loadDevice(ws, state, loopit);
  }
  else if (!state.providerUrl) {
    getProviderName(ws, state, loopit);
  }
  else if (!state.oauth3) {
    getProviderDirectives(ws, state, loopit);
  }
  else if (!state.username) {
    getId(ws, state, loopit);
  }
  else if (!state.triedSession) {
    getExistingSession(ws, state, loopit);
  }
  // TODO load profile by provider / username
  else if (!state.userMeta) {
    getCredentialMeta(ws, state, loopit);
  }
  else if (!state.userMeta.kdf) {
      //console.log('[oauth3-cli] DEBUG userMeta');
      //console.log(state.userMeta);
      //process.exit(1);

    if (!state.totpKey) {
      createQr(ws, state, loopit);
    }
    else if (!state.secret) {
      createSecret(ws, state, loopit);
    }
    else {
      createCredential(ws, state, loopit);
    }
  }
  else if (!state.session) {
    if (!state.secret) {
      getSecret(ws, state, loopit);
    }
    else if (state.userMeta.totpEnabledAt && !state.totpToken && false !== state.totpToken) {
      getToken(ws, state, loopit);
    }
    else {
      loginCredential(ws, state, loopit);
    }
  }
  else if (!(state.sessionTested)) {
    testSession(ws, state, loopit);
  }
  else if (!(state.accounts || state.profile)) {
    getAccounts(ws, state, loopit);
  }
  else if (state.accounts && !state.accounts.length) {
    getAccount(ws, state, loopit);
  }
  else if (!state.echo) {
    getEcho(ws, state, loopit);
  }
  else if (!state.card) {
    getCards(ws, state, loopit);
  }
  else {
    console.log("[oauth3-cli] complete / NOT IMPLEMENTED");
    console.log(state.session.decoded);
  }
}

function loadProfiles(ws, state, cb) {
  A.profile({
    rcpath: state.rcpath
  }).then(function (results) {
    if (results.errors.length) {
      state.msgs = results.errors.map(function (err) {
        return " * " + err.code + ": " + (err.message || err.toString());
      });
      state.msgs.unshift("ERROR: encountered errors while reading your config directory:");
      reCompute(ws, state);
      process.exit(1);
    }

    state.configs = results.configs;
    cb(null);
  });
}

function loadDevice(ws, state, cb) {
  A.device({
    rcpath: state.rcpath
  }).then(function (results) {
    state.device = results.device;
    cb(null);
  });
}

function main(options) {
  //var readline = require('readline');
  //var rl = readline.createInterface(process.stdin, process.stdout);
  var ws = process.stdout;
  var homedir = require('homedir')();

  state.homedir = homedir;
  state.rcpath = path.join(state.homedir, '.oauth3');
  state.username = options.id;
  state.providerUrl = options.provider;
  state.totpKey = options.totp;
  state.secret = options.secret;
  state.scope = options.scope;
  state.appId = options.client;
  state.ccNumber = options['cc-number'];
  state.ccExp = options['cc-exp'];
  state.ccCvc = options['cc-cvc'];

  if ('false' === state.totpKey) {
    state.totpKey = false;
    state.totpToken = false;
  }

  if (state.totpKey) {
    state.totpToken = authenticator.generateToken(state.totpKey);
    if (!state.totpToken) {
      throw new Error("invalid totp key");
    }
  }

  ws.on('resize', function () {
    reCompute(ws, state);
  });
  reCompute(ws, state);

  doTheDo(ws, state);
}

cli.parse({
  provider: [ false, "Provider URL which to use (such as facebook.com)", 'string' ]
, id: [ false, "The login id, typically your email address", 'string' ]
, secret: [ false, "The login shared secret, typically your passphrase (12+ characters, ~72+ bits)", 'string' ]
, totp: [ false, "base32-encoded 160-bit key to use for account creation (or false to disable)", 'string' ]
, scope: [ false, "OAuth scope", 'string' ]
, client: [ false, "OAuth client id (if different than provider url)", 'string' ]

, 'cc-number': [ false, "Credit Card number (xxxx-xxxx-xxxx-xxxx)", 'string' ]
, 'cc-exp': [ false, "Credit Card expiration (mm/yy)", 'string' ]
, 'cc-cvc': [ false, "Credit Card Verification Code (xxx)", 'string' ]
//, 'cc-email': [ false, "Credit Card email (xxxxxx@xxxx.xxx)", 'string' ]
//, 'cc-nick': [ false, "Credit Card nickname (defaults to email)", 'string' ]
});

// ignore certonly and extraneous arguments
cli.main(function(_, options) {
  main(options);
});

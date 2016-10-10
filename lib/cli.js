'use strict';

var PromiseA = require('bluebird');

var CLI = module.exports;
var FNS = {};

var colors = require('colors/safe');
var qrcode = require('qrcode-terminal');
var authenticator = require('authenticator');
var checkCodes = require('./uudd.js');

// https://www.novell.com/documentation/extend5/Docs/help/Composer/books/TelnetAppendixB.html
var BKSP = String.fromCharCode(127);
var WIN_BKSP = "\u0008";
var ENTER = "\u0004";           // 13 // '\u001B[0m'
var CRLF = "\r\n";
var LF = "\n";
var CTRL_C = "\u0003";
var TAB = '\x09';
var ARROW_UP = '\u001b[A';      // 38
var ARROW_DOWN = '\u001b[B';    // 40
var ARROW_RIGHT = '\u001b[C';   // 39
var ARROW_LEFT = '\u001b[D';    // 37
// "\033[2J\033[;H" CLS // "\x1b[2J\x1b[1;1H"
// \033[0m RESET

CLI.init = function (rs, ws, state) {
  // var ws = process.stdout;
  if (!ws._resizer) {
    ws._pause = function () {
      ws._paused = true;
    };
    ws._resume = function () {
      ws._paused = false;
    };
    ws._resizer = function () {
      if (!ws._paused) {
        FNS.reCompute(ws, state);
      }
    };
    ws.on('resize', ws._resizer);
  }
  ws._resume();
  FNS.reCompute(ws, state);

  return ws;
};


function clearScreen(ws) {
  // msysgit on Windows is not a valid terminal
  if (!ws.columns || !ws.rows) {
    console.log("");
    console.log("Your console does not correctly report its width and height.");
    console.log("This is a known issue with some Windows consoles, such as msysgit");
    console.log("");
    console.log("Windows Users: Please try use cmd.exe, PowerShell, or bash (Win10/Ubuntu)");
    console.log("Others: Please try Terminal, iTerm, or Konsole");
    console.log("");
    console.log("If you need help, please make an issue at https://github.com/OAuth3/oauth3-cli/issues");
    console.log("");
    process.exit(1);
  }
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

function writeMenu(ws, state) {
  var cols = ws.columns;
  var rows = ws.rows;
  var line = (new Array(cols + 1)).join(' ') + '\n';
  var size = state.codes.split('').map(function () {
    return '█';
  }).join('');

  if (state.codeComplete) {
    size = colors.cyan(size);
  }
  size += ' [' + cols + 'x' + rows + ']';
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

function say(ws, state, msgs, y) {
  var stripAnsi = require('strip-ansi');
  var cols = ws.columns;
  var rows = ws.rows;

  if (!msgs) {
    msgs = state.msgs;
  }
  if (!y && 0 !== y) {
    y = Math.ceil(rows / 2) - Math.floor(msgs.length / 2);
  }

  msgs.forEach(function (msg) {
    var x = Math.floor(cols / 2) - Math.floor(stripAnsi(msg).length / 2);
    ws.cursorTo(x, y);
    ws.write(msg);
    y += 1;
  });

  ws.cursorTo(0, cols);
}

FNS.reCompute = function (ws, state) {
  if ('qr' === state.state) {
    FNS.qr(ws, state);
  } else {
    if (FNS.reComputeHelper(ws, state)) {
      say(ws, state);
      writeMenu(ws, state);
    }
  }
};

// TODO debounce
// TODO ignore input during pauses
function handleInput(ws, state, cb) {
  var stdin = state.rs || process.stdin;
  var debouncer = {
    set: function (fn) {
      clearTimeout(debouncer._timeout);
      if ('function' === typeof fn) {
        debouncer._timeout = setTimeout(function () {
          fn(ws, state);
        }, 300);
      }
    }
  };
  var onData;

  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.resume();

  state.input = state.input || '';
  state.hint = '';

  FNS.reCompute(ws, state);

  function callback(err, result) {
    stdin.removeListener('data', onData);

    stdin.setRawMode(false);
    stdin.pause();

    state.input = '';
    state.hint = '';
    state.hints = [];

    cb(err, result);
  }

  onData = function (ch) {
    debouncer.set(state.debounceCheck, ch);
    state.ch = ch.toString('utf8');
    ch = '';
    var check = checkCodes(state);
    if (-1 === check) {
      FNS.reCompute(ws, state);
    } else {
      writeMenu(ws, state);
    }
    if (1 === check) {
      state.state = '!!!';
      state.msgs = [colors.rainbow('hadouken!!!')];
      say(ws, state);
    }

    if (CTRL_C === state.ch) {
      console.log("");
      console.log("received CTRL+C and quit");
      process.exit(0);
      callback(new Error("cancelled"));
    }

    if (state.__pause_input) {
      return;
    }

    switch (state.ch) {
    case ENTER:
    case CRLF:
    case LF:
    case "\n\r":
    case "\r":
        // TODO pause on enter, check validity via verify, then unpause or close and callback

        if (state.enterCheck) {
          state.enterCheck(ws, state, ENTER).then(function (pass) {
            if (pass) {
              callback(null, state.input);
              return;
            }

            if (state.hint) {
              // state.input = state.hint;
              state.input += state.hint.slice(state.input.length);

              state.enterCheck(ws, state, ENTER).then(function (pass) {
                if (pass) {
                  callback(null, state.input);
                  return;
                }
              });
            }
          });
          return;
        }

        if (state.hint) {
          // state.input = state.hint;
          state.input += state.hint.slice(state.input.length);
        }
        callback(null, state.input);
        return;
        //break;
    case BKSP:
    case WIN_BKSP:
        // filler character for fudging cursor position
        if (/•$/.test(state.input)) {
          state.input = state.input.replace(/•+$/, '');
        }
        else {
          state.input = state.input.slice(0, state.input.length - 1);
        }
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
      FNS.search(ws, state);
      return;
    }

    writeSecret(ws, state);
  };

  stdin.on('data', onData);
}

function handleSecret(ws, state, cb) {
  state.isSecret = true;
  handleInput(ws, state, function (err, result) {
    state.isSecret = false;
    cb(err, result);
  });
}

// excuse me. EXCUSE ME. SECURDY SE-CURDY.
// We got a complicated terminal
function dollarBillCheck(stream, state) {
  var cols = stream.columns;
  var rows = stream.rows;
  var minCols = Math.max(state.minCols || 80);
  var minRows = Math.max(state.minRows || 24);

  /*
  if ('qr' === state.state) {
    console.log('Current Size:', cols + 'x' + rows);
    console.log('Needed Size:', minCols + 'x' + minRows);
    console.log('Fits:', cols >= minCols, rows >= minRows);
    process.exit(1);
  }
  //*/

  if (cols >= minCols && rows >= minRows) {
    if (state.__pause_input) {
      // restore the previous messages
      state.prompt = state.__pause_prompt;
      state.__pause_input = false;
    }
    return true;
  }

  // backup the current messages
  if (!state.__pause_input) {
    state.__pause_input = true;
    state.__pause_prompt = state.prompt;
  }

  clearScreen(stream);
  /*
  // This will DESTROY the OCD
  // There will be no survivors!!!
  // (as soon as you get the size right, the message goes away)
  stream.write("Did you know that the 80x24 terminal was modeled after the size of a dollar bill?\n");  // 2
  stream.write("FACT: http://programmers.stackexchange.com/q/148677\n");                                // 1
  stream.write("\n\n\n\n\n\n\n\n");                                                                     // 8
  stream.write("\n\n\n\n\n\n\n\n");                                                                     // 8
  stream.write("And do you know who doesn't support terminals smaller than a 1890 US dollar bill?\n");  // 2
  stream.write("FACT: us\n");                                                                           // 2
  // SIZE MATTERS, it's not just how you use it!
  // prompt shows up as final line
  */

  state.prompt = '[Resize Window to Continue]';
  var msgs = [
    "Please resize this terminal"
  , ""
  , "Note: You may need to use CTRL- or CMD- if your screen is small."
  , ""
  , "[ Current Window Size: " + cols + "x" + rows + " ]"
  , ""
  , "[ Required Window Size: " + Math.max(minCols, cols) + "x" + Math.max(minRows, rows) + " ]"
  , ""
  , ""
  , "[ Fun Fact ]"
  , "Did you know that the default terminal size of 80x24"
  , "shares history with the US dollar bill? (bit.ly/1QTacCf)"
  ];

  writeMenu(stream, state);
  say(stream, state, msgs/*, y*/);

  return false;
}

FNS.reComputeHelper = function (ws, state) {
  var cols = ws.columns;
  var rows = ws.rows;

  state.width = cols;
  state.height = rows;

  clearScreen(ws, state);
  // TODO check needed w x h
  return dollarBillCheck(ws, state);
};

FNS.qr = function (ws, state) {
  var stripAnsi = require('strip-ansi');
  var cols = ws.columns;
  //var rows = ws.rows;
  var x = 3; // padding
  var y = 3; // headers

  state.minCols = state.msgs.reduce(function (n, msg) {
    return Math.max(n, stripAnsi(msg || '').length);
  }, 0);
  state.minRows = (state.msgs.length - 1)
    + 6 // headers + footers
    + state.qr.split('\n').length
  ;

  if (!FNS.reComputeHelper(ws, state)) {
    // don't try to write to screen
    return;
  }

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

  writeMenu(ws, {
    title: state.title
  , codes: state.codes
  , prompt: state.prompt
  , isSecret: state.isSecret
  , unmask: state.unmask
  });

  state.minCols = 0;
  state.minRows = 0;
};

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

FNS.search = function (ws, state) {
  var hints = state.hints.filter(function (provider) {
    //return provider.toLowerCase().match(new RegExp(escapeRe('^' + state.input)));
    return (state.input || state.autohint) && 0 === provider.toLowerCase().indexOf(state.input);
  });

  state.hint = hints[0] || '';
  hint(ws, state);
};

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

function getInput(label, re, ws, state, cb) {
  state.state = 'input';
  //state.msgs = msgs;
  state.error = null;
  state.prompt = label;


  if (state.input && re.test(state.input)) {
    cb(null, state.input);
    state.input = '';
    return;
  }
  /*
  state.inputCallback = function (ws, state) {
    if (!re.test(state.input)) {
      state.input = state.input.slice(0, state.input.length - 1);
    }
  };
  */
  handleInput(ws, state, function (err, result) {
    //state.inputCallback = null;
    if (!re.test(result)) {
      return getInput(label, re, ws, state, cb);
    }

    cb(err, result);
  });

  FNS.search(ws, state);
}

function getCcEmail(ws, state, cb) {
  if (state.ccEmail) {
    state.input = state.ccEmail;
  }
  state.state = 'email';
  state.autohint = true;
  state.hints = state.ccEmail && [state.ccEmail]
    || state.username && [state.username]
    || getEmailHints(state.input)
  ;
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
    FNS.search(ws, state);
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

  FNS.search(ws, state);
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
  if (0 === state.purchaseAmount) {
    state.msgs.push("");
    state.msgs.push("-- $0 --");
    state.msgs.push("Your card WILL NOT be charged.");
    state.msgs.push("Your free domain WILL NOT be auto-renewed.");
    state.msgs.push("-- $0 --");
    state.msgs.push("");
    state.msgs.push("Your card will be used for verification only.");
  }
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


//
//
//

CLI.readInputMailingAddressAsync = function (state) {
  return new PromiseA(function (resolve) {
    return CLI._readInputMailingAddress(state, resolve);
  });
};

CLI._readInputMailingAddress = function (state, cb) {
  var ws = state.ws;
  var msgs = [
    "The domain registry requires contact information."
  , ""
  , "This information will be made public in the international domain registry."
  , "This means that you will get spam snail mail (not from us) and also"
  , "phone calls from people (again, not us) in India claiming to be from Google - but they aren't."
  , ""
  , "For many domains it's okay to put an alternate address and phone number,"
  , "but YOUR EMAIL IS REQUIRED for various validations."
  , ""
  , "WARNING: Some domains, such as .me and .us, will cancel your registration"
  , "without refund if your mailing address is non-deliverable or not verifiable."
  ];
  state.msgs = msgs;
  state.input = state.rawAddr.firstName;
  state.hintAddress = {};
  state.hintAddresses = state.addresses.slice(0);
  state.hintPhones = state.phones.map(function (n) { return n.node; });
  state.hintEmails = state.emails.map(function (n) { return n.node; });

  function createInputCallback(ws, state, attr) {
    function inputCb(ws, state) {
      state.hints = require('./country-helper').findAddress(state, attr);

      FNS.search(ws, state);
    }
    inputCb(ws, state);
    return inputCb(ws, state);
  }

  function getCountry(ws, state, cb) {
    state.state = 'country';
    //state.msgs = [];
    state.prompt = 'Country (i.e. US, CA, RU): ';

    state.inputCallback = function inputCallback(ws, state) {
      var prompt = require('./country-helper').getCountryHelper(state);

      state.countryData = prompt;

      ws.cursorTo(0);
      ws.write(state.prompt);
      ws.write(prompt.autocomplete);
      //ws.moveCursor(-1 * r.hintlen, 0);
      ws.cursorTo(state.prompt.length + prompt.position);
    };

    handleInput(ws, state, function (err, result) {
      state.input = result;
      state.inputCallback(ws, state);
      state.input = '';
      state.inputCallback = null;

      // just the 2-character code
      cb(null, state.countryData.code);
    });

    // pre-fill suggestion
    state.inputCallback(ws, state);
  }

  //state.hints = [];
  state.inputCallback = createInputCallback(ws, state, 'firstName');
  state.autohint = true;
  getInput('First Name: ', /[A-Z][A-Za-z\.\-' ]*/, ws, state, function (err, first) {
    state.inputCallback = null;

    state.inputCallback = createInputCallback(ws, state, 'lastName');
    state.input = state.rawAddr.lastName;
    getInput('Last Name: ', /[A-Z][A-Za-z\.\-' ]*/, ws, state, function (err, last) {
      state.inputCallback = null;

      state.input = state.rawAddr.phone;
      state.hints = state.hintPhones;
      getInput('Phone: ', /[\+0-9\.\-]+/, ws, state, function (err, phone) {

        // TODO use email hinter
        state.hints = (state.username || state.email)
          && [state.email || state.username] || state.hintEmails;
        state.input = state.rawAddr.email;
        getInput('Email: ', /[^\@]+@[^\.]+\.[^\.]+/, ws, state, function (err, email) {

          state.inputCallback = createInputCallback(ws, state, 'streetAddress');
          state.input = state.rawAddr.streetAddress || state.rawAddr.line1;
          getInput('Street Address: ', /[a-z\.\-' ]+/i, ws, state, function (err, line1) {
            state.inputCallback = null;

            state.inputCallback = createInputCallback(ws, state, 'extendedAddress');
            state.input = state.rawAddr.extendedAddress || state.rawAddr.line2;
            //state.emptyOkay = true;
            getInput('Extended Address: ', /[a-z\.\-' ]*/i, ws, state, function (err, line2) {
              state.inputCallback = null;

              line2 = (line2 || '').trim();

              state.inputCallback = createInputCallback(ws, state, 'locality');
              //state.emptyOkay = false;
              state.input = state.rawAddr.locality;
              getInput('City: ', /[a-z\.\-' ]+/i, ws, state, function (err, locality) {
                state.inputCallback = null;

                state.inputCallback = createInputCallback(ws, state, 'region');
                state.input = state.rawAddr.region;
                getInput('State: ', /[a-z\.\-' ]+/i, ws, state, function (err, region) {
                  state.inputCallback = null;

                  state.inputCallback = createInputCallback(ws, state, 'postalCode');
                  state.input = state.rawAddr.postalCode;
                  getInput('Zip: ', /[0-9a-z\.\-' ]+/i, ws, state, function (err, postalCode) {
                    state.inputCallback = null;

                    state.input = state.rawAddr.countryCode;
                    getCountry(ws, state, function (err, countryCode) {
                      state.inputCallback = null;
                      state.autohint = false;

                      state.address = {
                        firstName: first
                      , lastName: last
                      , email: email
                      , phone: phone
                      , streetAddress: line1
                      , line1: line1
                      , extendedAddress: line2
                      , line2: line2
                      , locality: locality
                      , region: region
                      , postalCode: postalCode
                      , country: countryCode
                      , countryCode: countryCode
                      , node: [ first, last, line1, line2, locality, region
                              , postalCode, countryCode ].map(function (el) {
                                return (el || '').toLowerCase().trim();
                              }).join('\t')
                      };

                      cb(null, state.address);
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
};

CLI.readCreditCardAsync = function (state) {
  var ws = state.ws;
  return new PromiseA(function (resolve) {
    state.unmask = true;
    getCcNumber(ws, state, function (err, num) {
      getCcExp(ws, state, function (err, exp) {
        getCcCvc(ws, state, function (err, cvc) {
          state.unmask = true;
          getCcEmail(ws, state, function (err, email) {
            resolve({
              number: num
            , exp_month: exp.substr(0, 2)
            , exp_year: '20' + exp.substr(2, 2)
            , cvc: cvc

            , email: email
            });
          });
        });
      });
    });
  });
};

CLI.showQrAsync = function (state) {
  var ws = state.ws;
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
    (state.totpRetry && ("[Take #" + (state.totpRetry + 1) + "] ") || '')
  + "Create New Account: Add Multi-Factor Authentication (2FA/MF1)"
  , ""
  ];

  qrcode.setErrorLevel('L'); // L: 7%, M: 15%, Q: 25%, H: 30%
  qrcode.generate(url, function (qr) {
    state.qr = qr;
    state.msgs.push('__RAW__');
  });

  state.msgs.push(url);
  state.msgs.push("");
  state.msgs.push("Download the Authy App at https://www.authy.com/app/");

  FNS.reCompute(ws, state);

  return PromiseA.resolve();
};

CLI.verifyQrAsync = function (state) {
  var ws = state.ws;
  state.error = null;
  state.prompt = 'Enter 6-digit Authy Token: ';

  // TODO handle token as 000000 with delimeters '-', ' ', or '.'
  return new PromiseA(function (resolve) {
    handleInput(ws, state, function (err, token) {
      if (!authenticator.verifyToken(state._totpKey, token)) {
        state.totpRetry += 1;
        CLI.verifyQrAsync(ws, state).then(resolve);
        return;
      }

      state.totpKey = state._totpKey;
      state.qr = null;
      state.state = '';

      resolve(state.totpKey);
    });
  });
};

CLI.readProviderUrlAsync = function (state) {
  var ws = state.ws;
  var providers = [ 'oauth3.org'/*, 'daplie.com'*/ ];
  state.state = 'welcome';
  state.hints = providers.slice(0);
  state.msgs = [
    "Welcome!"
  , "It looks like you don't have any stored credentials or profiles."
  , ""
  , "Where would you like to create an account?"
  , ""
  ];
  providers.sort().forEach(function (provider) {
    state.msgs.push("• " + provider);
  });
  state.msgs.push('');
  state.msgs.push('Type the name of one of the account providers above (or any of your choosing)');
  state.error = null;
  state.prompt = '> ';

  // TODO allow commandline argument for provider
  return new PromiseA(function (resolve) {
    handleInput(ws, state, function (err, input) {
      if (!input) {
        state.error = "";
        return CLI.readProviderUrlAsync(ws, state);
      }

      state.providerUrl = input;
      resolve();
    });
  });
};

CLI.readCredentialIdAsync = function (state) {
  var ws = state.ws;

  state.state = 'login';
  state.msgs = [
    "Login and/or Create Account"
  , ""
  ];
  /*
  Object.keys(state.oauth3).forEach(function (key) {
    var dir = state.oauth3[key];

    if (dir.method) {
      state.msgs.push(key + " [" + dir.method + "] " + dir.url);
    }
  });
  */
  state.msgs.push('');
  state.msgs.push('');
  state.msgs.push('');
  state.msgs.push("Type the email you use (or will use) for " + state.providerUrl + ":");

  state.error = null;

  state.inputCallback = function (ws, state) {
    state.hints = getEmailHints(state.input);
    if (/@/.test(state.username)) {
      state.hints.unshift(state.username);
    }
    FNS.search(ws, state);
  };

  return new PromiseA(function (resolve) {
    handleInput(ws, state, function (err, userId) {
      state.inputCallback = null;
      state.username = userId;

      resolve();
    });
  });
};

CLI.readTotpTokenAysnc = function (state) {
  var ws = state.ws;

  if (state.totpKey) {
    state.totpToken = authenticator.generateToken(state.totpKey);
    return PromiseA.resolve();
  }

  state.state = 'token';
  state.msgs = [
    "Enter your Two-Factor Auth Code"
  // TODO
  //, ""
  //, "(you can skip by leaving the code blank)"
  ];
  state.prompt = 'Authenticator 6-digit token: ';

  return new PromiseA(function (resolve) {
    handleInput(ws, state, function (err, token) {
      state.totpToken = token || false;

      resolve();
    });
  });
};

CLI.readNewCredentialSecretAsync = function (state) {
  var ws = state.ws;

  state.state = 'secret';
  state.msgs = [
    "Now it's time to create a passphrase"
  , ""
  , "Choose something 16 characters or more"
  ];
  state.prompt = 'Create a Passphrase ';

  return new PromiseA(function (resolve) {
    handleSecret(ws, state, function (err, secret) {
      state.secret = secret;

      resolve();
    });
  });
};

CLI.readCredentialSecretAsync = function (state) {
  var ws = state.ws;

  state.state = 'secret';
  state.msgs = [
    "Now it's time to enter your passphrase"
  ];
  state.prompt = 'Enter your Passphrase ';

  return new PromiseA(function (resolve) {
    handleSecret(ws, state, function (err, secret) {
      state.secret = secret;

      resolve();
    });
  });
};

CLI.readCredentialOtpAsync = function (state) {
  var ws = state.ws;

  state.state = 'login-code';
  state.msgs = [
    "Now it's time to enter your Login Code"
  , "(it should have been sent to you via Email or Text)"
  ];
  state.prompt = 'Enter the Login Code: ';

  return new PromiseA(function (resolve) {
    handleInput(ws, state, function (err, otpCode) {
      state.otpCode = otpCode;

      resolve();
    });
  });
};

// TODO
CLI._handleInput = handleInput;
CLI._writePrompt = writePrompt;

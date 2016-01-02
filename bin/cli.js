'use strict';

var escapeRe = require('escape-string-regexp');
var path = require('path');
var cli = require('cli');
var colors = require('colors/safe');
var authenticator = require('authenticator');
var qrcode = require('qrcode-terminal');
var A = require('../');
var A3 = require('../lib/utils');

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

  // Prompt
  var prompt = state.prompt || '> ';
  ws.cursorTo(0, rows - 1);
  ws.write(prompt);
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
  ws.write(state.prompt);
  //ws.write(prompt); // colors.bold(state.input));
  ws.write(complete);
  ws.moveCursor(-1 * part.length, 0);
}

function search(ws, state) {
  var hints = state.hints.filter(function (provider) {
    //return provider.toLowerCase().match(new RegExp(escapeRe('^' + state.input)));
    return state.input && 0 === provider.toLowerCase().indexOf(state.input);
  });

  state.hint = hints[0] || '';
  hint(ws, state);
}

function handleSecret(ws, state, cb) {
  state.isSecret = true;
  state.unmask = false;
  handleInput(ws, state, function (err, result) {
    state.isSecret = false;
    state.unmask = true;
    cb(err, result);
  });
}

function handleInput(ws, state, cb) {
  var stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.resume();

  state.input = '';
  state.hint = '';

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

    if (!state.isSecret) {
      search(ws, state);
      return;
    }

    writeSecret(ws, state);
  }

  stdin.on('data', onData);
}

function writeSecret(ws, state) {
  var input;

  ws.cursorTo(0);
  ws.write(state.prompt);
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
  reCompute(ws, state);
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

function getUsername(ws, state, cb) {
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
  reCompute(ws, state);

  handleInput(ws, state, function (err, username) {
    state.username = username;

    cb(null);
  });
}

function getProviderDirectives(ws, state, cb) {
  return A3.getOauth3Json(state.providerUrl).then(function (results) {
    state.oauth3 = results;
    cb(null);
  });
}

function getUserMeta(ws, state, cb) {
  return A3.getUserMeta(state.oauth3, state.username).then(function (results) {
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

  reCompute(ws, state);

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
  state.prompt = 'Enter your Passphrase (↑ to show, ↓ to hide): ';

  reCompute(ws, state);

  handleSecret(ws, state, function (err, secret) {
    state.secret = secret;

    cb(null);
  });
}

function getSecret(ws, state, cb) {
  state.state = 'secret';
  state.msgs = [
    "Now it's time to enter your passphrase"
  ];
  state.prompt = 'Create a Passphrase (↑ to show, ↓ to hide): ';

  reCompute(ws, state);

  handleSecret(ws, state, function (err, secret) {
    state.secret = secret;

    cb(null);
  });
}

function createUser(ws, state, cb) {
  A3.createUser(state.oauth3, {
    appId: state.oauth3.provider_uri
  , nodeType: 'email'
  , userId: state.username
  , secret: state.secret
  , mfa: state.totpKey && { totp: state.totpKey }
  }).then(function (result) {
    if (result.jwt || result.access_token) {
      state.userMeta = result;
      state.session = result;
      // TODO save to file
    } else {
      state.userMeta = null;
      state.session = null;
      console.log(result);
      process.exit(0);
    }

    cb(null);
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
  reCompute(ws, state);

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

function loginUser(ws, state, cb) {
  state.userMeta = null;
  state.session = null;
  state.totpToken = null;
  cb(null);
  /*
  handleSecret(ws, state, function (err, secret) {
  });
  */
}

function doTheDo(ws, state) {
  function loopit() {
    doTheDo(ws, state);
  }

  if (!state.configs) {
    loadProfiles(ws, state, loopit);
  }
  else if (!state.providerUrl) {
    getProviderName(ws, state, loopit);
  }
  else if (!state.oauth3) {
    getProviderDirectives(ws, state, loopit);
  }
  else if (!state.username) {
    getUsername(ws, state, loopit);
  }
  else if (!state.userMeta) {
    getUserMeta(ws, state, loopit);
  }
  else if (!state.userMeta.kdf) {
    if (!state.totpKey) {
      createQr(ws, state, loopit);
    }
    else if (!state.secret) {
      createSecret(ws, state, loopit);
    }
    else {
      createUser(ws, state, loopit);
    }
  }
  else if (!state.session) {
    if (!state.secret) {
      getSecret(ws, state, loopit);
    }
    else if (false !== state.totpToken && !state.totpToken) {
      getToken(ws, state, loopit);
    }
    else {
      loginUser(ws, state, loopit);
    }
  }
  else {
    console.log("NOT IMPLEMENTED");
    process.exit(1);
  }
}

function loadProfiles(ws, state, cb) {
  var rcpath = path.join(state.homedir, '.oauth3');

  A.profile({
    rcpath: rcpath
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

function main(options) {
  //var readline = require('readline');
  //var rl = readline.createInterface(process.stdin, process.stdout);
  var ws = process.stdout;
  var homedir = require('homedir')();

  state.homedir = homedir;
  state.username = options.id || state.username;
  state.providerUrl = options.provider || state.providerUrl;
  state.totpKey = options.totp || state.totpKey;

  ws.on('resize', function () {
    reCompute(ws, state);
  });
  reCompute(ws, state);

  doTheDo(ws, state);
}

cli.parse({
  provider: [ false, "Provider URI which to use (such as facebook.com)", 'string' ]
, id: [ false, "The login id, typically your email address", 'string' ]
, totp: [ false, "base32-encoded 160-bit key to use for account creation", 'string' ]
});

// ignore certonly and extraneous arguments
cli.main(function(_, options) {
  main(options);
});

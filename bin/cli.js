'use strict';

var escapeRe = require('escape-string-regexp');
var colors = require('colors/safe');
var A = require('../');

var code = [['u'], ['u'], ['d'], ['d'], ['l'], ['r'], ['l'], ['r'], ['b'], ['a'], [' ']];
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
  var prompt = '> ';
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

function reCompute(ws, state) {
  clearScreen(ws, state);
  if (!dollarBillCheck(ws, state)) {
    return;
  }
  say(ws, state);
  writeMenu(ws, state);
}

function checkCodes(ws, state) {
  var nextChars = code[state.codes.length];

  if (-1 === nextChars.indexOf(state.ch)) {
    state.codes = '';
    reCompute(ws, state);
    return;
  }

  state.codes += state.ch;
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

  ws.cursorTo(0);
  ws.write(state.prompt);
  //ws.write(prompt); // colors.bold(state.input));
  ws.write(complete);
  ws.moveCursor(-1 * part.length, 0);
}

function search(ws, state) {
  var providers = A.providers.filter(function (provider) {
    //return provider.toLowerCase().match(new RegExp(escapeRe('^' + state.input)));
    return 0 === provider.toLowerCase().indexOf(state.input);
  });

  state.hint = providers[0] || '';
  hint(ws, state);
}

function handleInput(ws, state) {
  var stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.resume();

  var password = '';
  stdin.on('data', function (ch) {
      var BKSP = String.fromCharCode(127);
      var TAB = '\x09';
      ch = ch.toString('utf8');
      state.ch = ch;
      checkCodes(ws, state);

      switch (ch) {
      case "\n":
      case "\r":
      case "\u0004":
          // They've finished typing their password
          ws.write('\n');
          stdin.setRawMode(false);
          stdin.pause();
          callback(false, password);
          break;
      case "\u0003":
          // Ctrl-C
          callback(true);
          break;
      case BKSP:
          // Backspace
          password = password.slice(0, password.length - 1);
          ws.clearLine();
          ws.cursorTo(0);
          ws.write(state.prompt);
          ws.write(password.split('').map(function () {
            return '*';
          }).join(''));
          break;
      case TAB:
          if (state.hint) {
            ch = state.hint.slice(state.input.length);
          }
          /* falls through */
      default:
          // More passsword characters
          //process.stdout.write('*');
          password += ch;
          state.input = password;
          search(ws, state);
          break;
      }
  });
}

function main() {
  //var readline = require('readline');
  //var rl = readline.createInterface(process.stdin, process.stdout);
  var ws = process.stdout;

  ws.on('resize', function () {
    reCompute(ws, state);
  });
  reCompute(ws, state);

  var path = require('path');
  var homedir = require('homedir')();
  var rcpath = path.join(homedir, '.oauth3');

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

    if (!results.configs.length) {
      state.state = 'welcome';
      state.msgs = [
        "Welcome!"
      , "It looks like you don't have any stored credentials or profiles."
      , ""
      , "Type oauth3.org to get started"
      ];
      reCompute(ws, state);
      state.prompt = '> ';
      handleInput(ws, state);
      return;
    }
  });


    /*
  function ask() {
    process.stdout.cursorTo(5, 5);
    rl.question("What do you think of Node.js? ", function(answer) {
      // TODO: Log the answer in a database
      console.log("Thank you for your valuable feedback:", answer);

      ask(); //rl.close();
    });
  }
    */
}

main();

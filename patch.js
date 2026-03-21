// Qobuz SMTC Patch
//
// Adds Windows System Media Transport Controls to Qobuz Desktop.
//
// Patches:
//   main-win32.js  — replaces empty SMTC stub (module 80725)
//                  — hooks sendMusicInfo for position data (global.__smtcLastPos)
//   app.html       — loads smtc-renderer.js after bundle.js
//
// Generates smtc-tone.wav on first run (sub-audible tone for SMTC activation).
//
// Usage:
//   node patch.js [qobuz-dir]     Apply patch
//   node patch.js --restore       Restore original files

const fs = require('fs');
const path = require('path');

// -- Resolve Qobuz directory -----------------------------------------------

function findQobuzDir() {
  // Explicit argument
  var args = process.argv.slice(2).filter(a => a !== '--restore');
  if (args.length > 0) return args[0];
  // Default: %LOCALAPPDATA%/Qobuz
  var local = process.env.LOCALAPPDATA || path.join(require('os').homedir(), 'AppData', 'Local');
  return path.join(local, 'Qobuz');
}

function findAppDir(qobuzDir) {
  if (!fs.existsSync(qobuzDir)) return null;
  var entries = fs.readdirSync(qobuzDir).filter(e => e.startsWith('app-')).sort().reverse();
  for (var j = 0; j < entries.length; j++) {
    var candidate = path.join(qobuzDir, entries[j], 'resources', 'app');
    if (fs.existsSync(path.join(candidate, 'main-win32.js'))) return candidate;
  }
  return null;
}

var QOBUZ = findQobuzDir();
var APP = findAppDir(QOBUZ);

if (!APP) {
  console.error('Could not find Qobuz app directory at: ' + QOBUZ);
  console.error('Usage: node patch.js [/path/to/Qobuz]');
  process.exit(1);
}

var MAIN = path.join(APP, 'main-win32.js');
var HTML = path.join(APP, 'app.html');
var WAV  = path.join(APP, 'smtc-tone.wav');
var BAK  = { js: MAIN + '.backup', html: HTML + '.backup' };

console.log('Qobuz app: ' + APP);

// -- Restore ---------------------------------------------------------------

if (process.argv.includes('--restore')) {
  var ok = false;
  [[BAK.js, MAIN, 'main-win32.js'], [BAK.html, HTML, 'app.html']].forEach(function (r) {
    if (fs.existsSync(r[0])) { fs.copyFileSync(r[0], r[1]); console.log('Restored', r[2]); ok = true; }
  });
  process.exit(ok ? 0 : 1);
}

// -- Generate smtc-tone.wav ------------------------------------------------
// 30s, 8kHz, mono, 16-bit PCM, 1Hz sine at -55dBFS (~480 KB).
// Inaudible (1Hz < 20Hz) but above Chromium's -72.25dBFS silence threshold.

if (!fs.existsSync(WAV)) {
  var sr = 8000, dur = 30, n = sr * dur, amp = Math.round(Math.pow(10, -55 / 20) * 32767);
  var buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (var w = 0; w < n; w++) buf.writeInt16LE(Math.round(amp * Math.sin(2 * Math.PI * w / sr)), 44 + w * 2);
  fs.writeFileSync(WAV, buf);
  console.log('Generated smtc-tone.wav (' + (buf.length / 1024).toFixed(0) + ' KB)');
}

// -- Copy smtc-renderer.js to app directory --------------------------------

var rendererSrc = path.join(__dirname, 'smtc-renderer.js');
var rendererDst = path.join(APP, 'smtc-renderer.js');
if (fs.existsSync(rendererSrc) && rendererSrc !== rendererDst) {
  fs.copyFileSync(rendererSrc, rendererDst);
}

// -- Validate --------------------------------------------------------------

var STUB = '80725:e=>{"use strict";e.exports=class{static init(){}static setInfo(e){}static reset(e){}}}';
var code = fs.readFileSync(MAIN, 'utf8');

if (!code.includes(STUB)) {
  // Already patched — restore first, then re-apply
  if (fs.existsSync(BAK.js)) {
    console.log('Already patched, restoring before re-applying...');
    fs.copyFileSync(BAK.js, MAIN);
    if (fs.existsSync(BAK.html)) fs.copyFileSync(BAK.html, HTML);
    code = fs.readFileSync(MAIN, 'utf8');
    if (!code.includes(STUB)) { console.error('SMTC stub not found after restore (wrong version?)'); process.exit(1); }
  } else {
    console.error('SMTC stub not found (wrong version?)');
    process.exit(1);
  }
}
if (!fs.existsSync(rendererDst)) { console.error('smtc-renderer.js not found'); process.exit(1); }

// -- Backup ----------------------------------------------------------------

if (!fs.existsSync(BAK.js))   fs.copyFileSync(MAIN, BAK.js);
if (!fs.existsSync(BAK.html)) fs.copyFileSync(HTML, BAK.html);

// -- Patch main-win32.js ---------------------------------------------------

var mod = fs.readFileSync(path.join(__dirname, 'smtc-main.js'), 'utf8');
code = code.replace(STUB, '80725:(e,a,i)=>{"use strict";\n' + mod + '}');

var hook = 'T.send("player-refresh-music-info",e)';
if (code.includes(hook)) {
  code = code.replace(hook, hook + ';if(typeof window==="undefined")global.__smtcLastPos=e');
}

var s = code.indexOf('80725:(e,a,i)'), e = code.indexOf(',80741:', s);
try { new Function('return ' + code.slice(s + 6, e)); }
catch (err) { console.error('Syntax error:', err.message); fs.copyFileSync(BAK.js, MAIN); process.exit(1); }

fs.writeFileSync(MAIN, code, 'utf8');

// -- Patch app.html --------------------------------------------------------

var html = fs.readFileSync(HTML, 'utf8');
if (!html.includes('smtc-renderer')) {
  html = html.replace(
    "window.__ENVIRONMENT__ = 'production';",
    "window.__ENVIRONMENT__ = 'production';\n      window.__nodeRequire = require;"
  );
  html = html.replace(
    '<script src="/bundle.js"></script>',
    '<script src="/bundle.js"></script>\n    <script>window.__nodeRequire("./smtc-renderer.js");</script>'
  );
  fs.writeFileSync(HTML, html, 'utf8');
}

console.log('Patch applied. Restart Qobuz to activate SMTC.');
console.log('Restore: node patch.js --restore');

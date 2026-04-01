// Qobuz SMTC Native Patch
// Usage: node patch.js [qobuz-dir] | node patch.js --restore

var fs = require('fs');
var path = require('path');
var qobuz = require('./lib/qobuz-paths');

var args = process.argv.slice(2).filter(function (a) { return a !== '--restore'; });
var QOBUZ = args.length > 0 ? args[0] : qobuz.defaultQobuzDir();
var APP = qobuz.findAppDir(QOBUZ);

if (!APP) {
  console.error('Qobuz not found at: ' + QOBUZ);
  console.error('Usage: node patch.js [/path/to/Qobuz]');
  process.exit(1);
}

var MAIN = path.join(APP, 'main-win32.js');
var HTML = path.join(APP, 'app.html');
var NODE = path.join(APP, 'smtc_native.node');
var BAK  = { js: MAIN + '.backup', html: HTML + '.backup' };

console.log('Qobuz app: ' + APP);

function findAddon() {
  var candidates = [
    path.join(__dirname, 'build', 'Release', 'smtc_native.node'),
    path.join(__dirname, 'smtc_native.node'),
    path.join(__dirname, 'prebuilds', 'smtc_native.node')
  ];
  for (var j = 0; j < candidates.length; j++) {
    if (fs.existsSync(candidates[j])) return candidates[j];
  }
  return null;
}

// Restore original files
if (process.argv.includes('--restore')) {
  var ok = false;
  if (fs.existsSync(BAK.js)) {
    fs.copyFileSync(BAK.js, MAIN);
    console.log('Restored main-win32.js');
    ok = true;
  }
  if (fs.existsSync(BAK.html)) {
    fs.copyFileSync(BAK.html, HTML);
    console.log('Restored app.html');
    ok = true;
  }

  [NODE, path.join(APP, 'smtc-renderer.js'), path.join(APP, 'smtc-tone.wav')].forEach(function (f) {
    if (fs.existsSync(f)) { fs.unlinkSync(f); console.log('Removed ' + path.basename(f)); }
  });

  process.exit(ok ? 0 : 1);
}

var addonSrc = findAddon();
if (!addonSrc) {
  console.error('smtc_native.node not found. Build first: npm run build:electron');
  process.exit(1);
}

// The exact webpack stub we replace
var STUB = '80725:e=>{"use strict";e.exports=class{static init(){}static setInfo(e){}static reset(e){}}}';
var code = fs.readFileSync(MAIN, 'utf8');

if (!code.includes(STUB)) {
  if (fs.existsSync(BAK.js)) {
    console.log('Already patched, restoring before re-applying...');
    fs.copyFileSync(BAK.js, MAIN);
    if (fs.existsSync(BAK.html)) fs.copyFileSync(BAK.html, HTML);
    code = fs.readFileSync(MAIN, 'utf8');
    if (!code.includes(STUB)) {
      console.error('SMTC stub not found after restore (wrong Qobuz version?)');
      process.exit(1);
    }
  } else {
    console.error('SMTC stub not found (wrong Qobuz version?)');
    process.exit(1);
  }
}

// Backup originals
if (!fs.existsSync(BAK.js))   fs.copyFileSync(MAIN, BAK.js);
if (!fs.existsSync(BAK.html)) fs.copyFileSync(HTML, BAK.html);

// Copy native addon
fs.copyFileSync(addonSrc, NODE);
console.log('Copied smtc_native.node (' + (fs.statSync(NODE).size / 1024).toFixed(0) + ' KB)');

// Clean up old audio-hack files
['smtc-renderer.js', 'smtc-tone.wav'].forEach(function (f) {
  var fp = path.join(APP, f);
  if (fs.existsSync(fp)) { fs.unlinkSync(fp); console.log('Removed old ' + f); }
});

// Replace the empty SMTC stub with our native-backed module
var mod = fs.readFileSync(path.join(__dirname, 'smtc-main.js'), 'utf8');
code = code.replace(STUB, '80725:(e,a,i)=>{"use strict";\n' + mod + '}');

// Hook sendMusicInfo to capture playback position into global.__smtcLastPos
var hook = 'T.send("player-refresh-music-info",e)';
if (code.includes(hook)) {
  code = code.replace(hook, hook + ';if(typeof window==="undefined")global.__smtcLastPos=e');
}

// Syntax-check the patched module
var s = code.indexOf('80725:(e,a,i)');
var e = code.indexOf(',80741:', s);
if (s >= 0 && e >= 0) {
  try { new Function('return ' + code.slice(s + 6, e)); }
  catch (err) {
    console.error('Syntax error in patched module:', err.message);
    fs.copyFileSync(BAK.js, MAIN);
    process.exit(1);
  }
}

fs.writeFileSync(MAIN, code, 'utf8');

// Revert old app.html patch if present (native approach doesn't touch app.html)
var html = fs.readFileSync(HTML, 'utf8');
if (html.includes('smtc-renderer') && fs.existsSync(BAK.html)) {
  fs.copyFileSync(BAK.html, HTML);
  console.log('Reverted old app.html patch (no longer needed)');
}

console.log('\nPatch applied (native SMTC). Restart Qobuz to activate.');
console.log('Restore: node patch.js --restore');
console.log('\nNOTE: This tool modifies your local Qobuz installation.');
console.log('This may violate the Qobuz Terms of Service. Use at your own risk.');

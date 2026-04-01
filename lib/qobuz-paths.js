// Shared Qobuz installation path resolution.

'use strict';

var fs = require('fs');
var path = require('path');

function defaultQobuzDir() {
  var local = process.env.LOCALAPPDATA || path.join(require('os').homedir(), 'AppData', 'Local');
  return path.join(local, 'Qobuz');
}

// Find the latest app-* version directory name (e.g. "app-8.1.0-b019").
function findLatestAppVersion(qobuzDir) {
  if (!fs.existsSync(qobuzDir)) return null;
  var entries = fs.readdirSync(qobuzDir)
    .filter(function (e) { return e.startsWith('app-'); })
    .sort()
    .reverse();
  return entries.length > 0 ? entries[0] : null;
}

// Find the resources/app directory containing main-win32.js.
function findAppDir(qobuzDir) {
  var version = findLatestAppVersion(qobuzDir);
  if (!version) return null;
  var candidate = path.join(qobuzDir, version, 'resources', 'app');
  if (fs.existsSync(path.join(candidate, 'main-win32.js'))) return candidate;
  return null;
}

// Detect Electron version from Qobuz binary by streaming chunks
// instead of loading the entire ~150MB exe into memory.
function detectElectronVersion(qobuzDir, appVersion) {
  var exePath = path.join(qobuzDir, appVersion, 'Qobuz.exe');
  if (!fs.existsSync(exePath)) return null;

  var fd = fs.openSync(exePath, 'r');
  var chunkSize = 1024 * 1024; // 1 MB chunks
  var buf = Buffer.alloc(chunkSize + 64); // overlap for boundary matches
  var overlap = 64;
  var offset = 0;
  var stat = fs.fstatSync(fd);
  var result = null;

  try {
    while (offset < stat.size) {
      var readStart = Math.max(0, offset - overlap);
      var bytesRead = fs.readSync(fd, buf, 0, buf.length, readStart);
      if (bytesRead === 0) break;
      var text = buf.toString('ascii', 0, bytesRead);
      var match = text.match(/Electron\/([\d.]+)/);
      if (match) { result = match[1]; break; }
      offset += chunkSize;
    }
  } finally {
    fs.closeSync(fd);
  }
  return result;
}

module.exports = {
  defaultQobuzDir: defaultQobuzDir,
  findLatestAppVersion: findLatestAppVersion,
  findAppDir: findAppDir,
  detectElectronVersion: detectElectronVersion
};

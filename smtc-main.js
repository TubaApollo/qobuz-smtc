// Qobuz SMTC — Main Process Module (replaces webpack module 80725)
//
// Uses native WinRT SMTC addon instead of the Chromium audio-element hack.
// No renderer-side code needed. No smtc-tone.wav. No app.html patching.
//
// Data flow:
//   Metadata:  setInfo(track)  →  native.setMetadata(title, artist, album, artwork)
//   State:     1s interval     →  global.__smtcLastPos.status  →  native.setState()
//   Position:  1s interval     →  global.__smtcLastPos.position  →  native.setPosition()
//   Actions:   SMTC button     →  native event  →  mediaActions (module 40879)
//
// global.__smtcLastPos is written by a hook in sendMusicInfo (injected by patch.js).

var electron = i(84157);
var playerCtrl = i(21032);
var mediaActions = i(40879);

var smtc = null;
var trackDuration = 0;
var lastState = "";
var lastMetaKey = "";
var syncInterval = null;
var initAttempts = 0;

function loadNative() {
  var appPath = electron.app.getAppPath();
  var nodePath = require('path').join(appPath, 'smtc_native.node');
  var m = { exports: {} };
  process.dlopen(m, nodePath);
  return m.exports;
}

function getHwnd() {
  var wins = electron.BrowserWindow.getAllWindows();
  for (var j = 0; j < wins.length; j++) {
    if (wins[j].isDestroyed()) continue;
    try {
      var title = wins[j].getTitle();
      if (title && title.indexOf('Qobuz') >= 0) return wins[j].getNativeWindowHandle();
    } catch (e) {}
  }
  return (wins.length > 0 && !wins[0].isDestroyed()) ? wins[0].getNativeWindowHandle() : null;
}

function initNative() {
  try {
    var native = loadNative();
    var hwnd = getHwnd();
    if (!hwnd) return false;

    native.init(hwnd, function (event, value) {
      switch (event) {
        case 'play':
        case 'pause':
        case 'stop':
          mediaActions.togglePlayPause();
          setTimeout(sync, 200);
          break;
        case 'next':
          mediaActions.next();
          break;
        case 'prev':
          mediaActions.previous();
          break;
        case 'seek':
          var pe = playerCtrl.playerEvents;
          if (pe && pe.currentTrack) {
            try { pe.currentTrack.offset(Math.floor(value * 1000)); } catch (e) {}
            setTimeout(function () {
              if (smtc) smtc.setPosition(value, trackDuration);
            }, 200);
          }
          break;
      }
    });

    smtc = native;
    return true;
  } catch (e) {
    return false;
  }
}

function titleOf(t) {
  return (t.title || '') + (t.version ? ' (' + t.version + ')' : '');
}

function artistOf(t) {
  return (typeof t.artist === 'string') ? t.artist
    : (t.performer && t.performer.name) || (t.artist && t.artist.name && t.artist.name.display)
    || (t.album && t.album.artist && t.album.artist.name) || '';
}

function albumOf(t) {
  return t.albumName || (t.album && t.album.title) || '';
}

function coverOf(t, img) {
  // Prefer HTTP URLs (WinRT handles them natively), fall back to local path
  var httpUrl = (t.album && t.album.image && (t.album.image.large || t.album.image.small)) || '';
  if (httpUrl) return httpUrl;
  return img || '';
}

function positionSec() {
  var d = global.__smtcLastPos;
  return (d && typeof d.position === 'number' && d.position >= 0) ? d.position : 0;
}

function playing() {
  var d = global.__smtcLastPos;
  return !!(d && d.status === 'Playing');
}

// WinRT SMTC interpolates position internally via playbackRate=1.
// We only need to send position on state changes, seeks, and track changes.
// No periodic drift detection needed — just anchor the position and let SMTC track.
function sync() {
  if (!smtc) return;
  var isPlaying = playing();
  var state = isPlaying ? 'playing' : 'paused';

  if (state !== lastState) {
    lastState = state;
    smtc.setState(state);
    if (trackDuration > 0) {
      smtc.setPosition(positionSec(), trackDuration);
    }
  }
}

function disableMediaKeys() {
  try {
    electron.globalShortcut.unregister('MediaPlayPause');
    electron.globalShortcut.unregister('MediaNextTrack');
    electron.globalShortcut.unregister('MediaPreviousTrack');
  } catch (e) {}
}

function deferredInit() {
  if (smtc) return;
  if (initAttempts > 20) return;
  initAttempts++;

  if (initNative()) {
    disableMediaKeys();
    syncInterval = setInterval(sync, 1000);
  } else {
    setTimeout(deferredInit, 1000);
  }
}

e.exports = class {
  static init() {
    setTimeout(deferredInit, 2000);
  }

  static setInfo(opts) {
    if (!opts) return;
    var track = opts.currentTrack;
    if (track) {
      // Only update metadata if track changed
      var title = titleOf(track);
      var artist = artistOf(track);
      var album = albumOf(track);
      var metaKey = title + '\0' + artist + '\0' + album;
      if (smtc && metaKey !== lastMetaKey) {
        lastMetaKey = metaKey;
        smtc.setMetadata(title, artist, album, coverOf(track, opts.imageCover));
      }
      if (track.duration > 0) {
        var isNew = trackDuration !== track.duration;
        trackDuration = track.duration;
        if (isNew && smtc) {
          setTimeout(function () { smtc.setPosition(positionSec(), trackDuration); }, 500);
        }
      }
    }
  }

  static reset(disable) {
    if (!smtc) return;
    if (disable) {
      trackDuration = 0;
      lastState = '';
      lastMetaKey = '';
      smtc.reset(true);
    } else {
      lastState = 'paused';
      smtc.reset(false);
    }
  }
};

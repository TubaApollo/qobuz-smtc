// Qobuz SMTC — Main Process Module (replaces webpack module 80725)
//
// Bridges the Qobuz player to Windows SMTC via navigator.mediaSession in the renderer.
//
// Data flow:
//   Metadata:  setInfo(track)  →  executeJavaScript  →  window.__smtc.setMetadata()
//   State:     1s interval     →  global.__smtcLastPos.status  →  window.__smtc.setState()
//   Position:  1s interval     →  global.__smtcLastPos.position  →  window.__smtc.setPosition()
//   Actions:   SMTC button     →  renderer IPC  →  ipcMain  →  mediaActions (module 40879)
//
// Position is only sent to the renderer on state changes or seeks (>3s drift).
// Chromium advances the seekbar internally between updates via playbackRate=1.
//
// global.__smtcLastPos is written by a hook in sendMusicInfo (injected by patch.js).
// Format: { position: seconds, status: "Playing"|"Stopped"|..., ... }

var electron = i(84157);
var playerCtrl = i(21032);
var mediaActions = i(40879);

var trackDuration = 0;
var lastState = "";
var lastSentPos = 0;

// -- Renderer communication -----------------------------------------------

function getMainFrame() {
  var wins = electron.BrowserWindow.getAllWindows();
  for (var j = 0; j < wins.length; j++) {
    if (wins[j].isDestroyed()) continue;
    try { if (wins[j].getTitle().indexOf("Qobuz") >= 0) return wins[j].webContents.mainFrame; }
    catch (e) {}
  }
  return (wins.length > 0 && !wins[0].isDestroyed()) ? wins[0].webContents.mainFrame : null;
}

function exec(js) {
  var frame = getMainFrame();
  if (frame) frame.executeJavaScript(js).catch(function () {});
}

function esc(s) {
  if (!s) return "";
  return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "");
}

// -- Track metadata --------------------------------------------------------

function titleOf(t)  { return (t.title || "") + (t.version ? " (" + t.version + ")" : ""); }
function artistOf(t) {
  return (typeof t.artist === "string") ? t.artist
    : (t.performer && t.performer.name) || (t.artist && t.artist.name && t.artist.name.display)
    || (t.album && t.album.artist && t.album.artist.name) || "";
}
function albumOf(t)  { return t.albumName || (t.album && t.album.title) || ""; }
function coverOf(t, img) {
  return img || (t.album && t.album.image && (t.album.image.large || t.album.image.small)) || "";
}

// -- Player state (from global.__smtcLastPos) ------------------------------

function positionSec() {
  var d = global.__smtcLastPos;
  return (d && typeof d.position === "number" && d.position >= 0) ? d.position : 0;
}

function playing() {
  var d = global.__smtcLastPos;
  return !!(d && d.status === "Playing");
}

// -- Send to renderer ------------------------------------------------------

function sendMetadata(track, cover) {
  exec("window.__smtc&&window.__smtc.setMetadata('" + esc(titleOf(track)) + "','"
    + esc(artistOf(track)) + "','" + esc(albumOf(track)) + "','" + esc(cover) + "')");
}

function sendState(isPlaying) {
  exec("window.__smtc&&window.__smtc.setState('" + (isPlaying ? "playing" : "paused") + "')");
}

function sendPosition(sec, dur) {
  if (dur > 0) exec("window.__smtc&&window.__smtc.setPosition(" + sec + "," + dur + ")");
}

function sync() {
  var isPlaying = playing();
  var state = isPlaying ? "playing" : "paused";
  if (state !== lastState) { lastState = state; sendState(isPlaying); }
  if (trackDuration > 0) { var p = positionSec(); sendPosition(p, trackDuration); lastSentPos = p; }
}

// -- Disable Electron globalShortcut media keys ----------------------------
// Required so Chromium's built-in SMTC handles them instead.

function disableMediaKeys() {
  try {
    electron.globalShortcut.unregister("MediaPlayPause");
    electron.globalShortcut.unregister("MediaNextTrack");
    electron.globalShortcut.unregister("MediaPreviousTrack");
  } catch (e) {}
}

// -- IPC handlers (SMTC actions from renderer) -----------------------------

electron.ipcMain.on("__smtc_play",  function () { mediaActions.togglePlayPause(); setTimeout(sync, 200); });
electron.ipcMain.on("__smtc_pause", function () { mediaActions.togglePlayPause(); setTimeout(sync, 200); });
electron.ipcMain.on("__smtc_next",  function () { mediaActions.next(); });
electron.ipcMain.on("__smtc_prev",  function () { mediaActions.previous(); });
electron.ipcMain.on("__smtc_stop",  function () { mediaActions.togglePlayPause(); setTimeout(sync, 200); });

electron.ipcMain.on("__smtc_seek", function (ev, ms) {
  var pe = playerCtrl.playerEvents;
  if (pe && pe.currentTrack) {
    try { pe.currentTrack.offset(Math.floor(ms)); } catch (e) {}
    setTimeout(function () { sendPosition(ms / 1000, trackDuration); }, 200);
  }
});

// -- Periodic sync (1s) ----------------------------------------------------
// Sends state on every change. Sends position only on state changes or
// when a seek is detected (position drifts >3s from expected).

function startSync() {
  setInterval(function () {
    if (!playerCtrl.playerEvents) return;
    try {
      var isPlaying = playing();
      var pos = positionSec();
      var state = isPlaying ? "playing" : "paused";

      if (state !== lastState) {
        lastState = state;
        sendState(isPlaying);
        if (trackDuration > 0) { sendPosition(pos, trackDuration); lastSentPos = pos; }
        return;
      }

      if (isPlaying && trackDuration > 0) {
        if (Math.abs(pos - (lastSentPos + 1)) > 3) { sendPosition(pos, trackDuration); }
        lastSentPos = pos;
      }
    } catch (e) {}
  }, 1000);
}

// -- Exported class (same interface as original stub) ----------------------

e.exports = class {
  static init() {
    setTimeout(disableMediaKeys, 3000);
    setTimeout(disableMediaKeys, 8000);
    startSync();
  }

  static setInfo(opts) {
    if (!opts) return;
    var track = opts.currentTrack;
    if (track) {
      sendMetadata(track, coverOf(track, opts.imageCover));
      if (track.duration > 0) {
        var isNew = trackDuration !== track.duration;
        trackDuration = track.duration;
        if (isNew) setTimeout(function () { sendPosition(positionSec(), trackDuration); }, 500);
      }
    }
  }

  static reset(disable) {
    if (disable) { trackDuration = 0; lastState = ""; exec("window.__smtc&&window.__smtc.reset(true)"); }
    else         { lastState = "paused";               exec("window.__smtc&&window.__smtc.reset(false)"); }
  }
}

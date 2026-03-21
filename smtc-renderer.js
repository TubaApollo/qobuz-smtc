// Qobuz SMTC — Renderer Module
//
// Activates Windows SMTC via a sub-audible <audio> element and exposes
// window.__smtc for the main process to control via mainFrame.executeJavaScript.
//
// Why the audio element is needed:
//   Chromium registers with SMTC only when an <audio> element produces output
//   above its -72.25 dBFS silence threshold. Qobuz plays audio through JUCE
//   (native), which Chromium can't see. The WAV contains a 1Hz sine at -55dBFS —
//   above the threshold but inaudible to humans (1Hz is below the 20Hz hearing range).
//
// The audio element must not loop — looping resets Chromium's position tracking.
// On 'ended' it restarts from the beginning. It only plays while the Qobuz player
// is playing, keeping the SMTC play/pause icon in sync.

(function () {
  'use strict';
  if (window.__qobuzSmtcReady) return;
  window.__qobuzSmtcReady = true;

  var nodeRequire = window.__nodeRequire || require;
  var fs = nodeRequire('fs');
  var ipc = nodeRequire('electron').ipcRenderer;
  var ms = navigator.mediaSession;
  if (!ms) return;

  // -- Audio element -------------------------------------------------------

  var audio = null;

  function ensureAudio() {
    if (audio) return;
    var target = document.body || document.documentElement;
    if (!target) return;
    audio = document.createElement('audio');
    audio.id = '__smtc_audio';
    audio.src = './smtc-tone.wav';
    audio.loop = false;
    audio.addEventListener('ended', function () { audio.currentTime = 0; audio.play().catch(function () {}); });
    target.appendChild(audio);
  }

  ensureAudio();
  if (!audio) document.addEventListener('DOMContentLoaded', ensureAudio);

  // -- Artwork conversion --------------------------------------------------
  // MediaMetadata only accepts http/https/data/blob URIs.

  function toArtworkSrc(path) {
    if (!path) return null;
    if (path.indexOf('http') === 0 || path.indexOf('data:') === 0) return path;
    try {
      var p = path.replace(/\//g, '\\');
      var buf = fs.readFileSync(p);
      var mime = p.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      return 'data:' + mime + ';base64,' + buf.toString('base64');
    } catch (e) { return null; }
  }

  // -- Action handlers → main process --------------------------------------

  ['play', 'pause', 'previoustrack', 'nexttrack', 'stop'].forEach(function (action) {
    var channel = '__smtc_' + { play: 'play', pause: 'pause', previoustrack: 'prev', nexttrack: 'next', stop: 'stop' }[action];
    ms.setActionHandler(action, function () { ipc.send(channel); });
  });

  ms.setActionHandler('seekto', function (d) {
    if (d && typeof d.seekTime === 'number') ipc.send('__smtc_seek', d.seekTime * 1000);
  });

  // -- API for main process ------------------------------------------------

  window.__smtc = {
    setMetadata: function (title, artist, album, artworkPath) {
      var artwork = [];
      var src = toArtworkSrc(artworkPath);
      if (src) artwork.push({ src: src, sizes: '300x300', type: 'image/jpeg' });
      try {
        ms.metadata = new MediaMetadata({ title: title || '', artist: artist || '', album: album || '', artwork: artwork });
      } catch (e) {
        try { ms.metadata = new MediaMetadata({ title: title || '', artist: artist || '', album: album || '' }); } catch (e2) {}
      }
    },

    setState: function (state) {
      ms.playbackState = state;
      if (state === 'playing') { ensureAudio(); if (audio) audio.play().catch(function () {}); }
      else if (audio)          { audio.pause(); }
    },

    setPosition: function (positionSec, durationSec) {
      if (!ms.setPositionState || durationSec <= 0) return;
      try {
        ms.setPositionState({
          duration: durationSec, playbackRate: 1,
          position: Math.min(Math.max(0, positionSec), durationSec)
        });
      } catch (e) {}
    },

    reset: function (full) {
      if (audio) audio.pause();
      if (full) { ms.playbackState = 'none'; ms.metadata = null; try { ms.setPositionState(); } catch (e) {} }
      else      { ms.playbackState = 'paused'; }
    }
  };
})();

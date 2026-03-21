# Qobuz SMTC Dirty Fix

Patches the Qobuz Desktop app to restore **Windows System Media Transport Controls (SMTC)** support — the media overlay, taskbar controls, and lock screen playback info that stopped working after version 7.2.0.

![Windows Media Overlay](https://learn.microsoft.com/en-us/windows/uwp/audio-video-camera/images/smtc-toast-background-background.png)

## What it does

- **Track metadata** — title, artist, album, cover art in the Windows media overlay
- **Playback controls** — play, pause, next, previous, stop, seek from Windows UI
- **Seek bar** — live position and duration tracking
- **Media keys** — hardware media keys routed through Windows SMTC

## Why this is needed

Qobuz removed their native SMTC integration (`nodert.node` / WinRT `SystemMediaTransportControls`) when upgrading from Electron 14 to Electron 32. This patch re-implements it using Chromium's built-in `navigator.mediaSession` API.

Since Qobuz uses JUCE (native C++) for audio playback instead of HTML `<audio>` elements, Chromium doesn't automatically register with SMTC. The patch uses a sub-audible tone (1Hz sine wave at -55dBFS — above Chromium's silence threshold but inaudible to humans) to activate the SMTC bridge.

## Installation

### Prerequisites

- **Node.js v16+** — [nodejs.org](https://nodejs.org)
- **Qobuz Desktop** — installed at the default location (`%LOCALAPPDATA%\Qobuz`)
- **Close Qobuz** before patching

### Windows (double-click)

```
install.bat
```

### Command line

```bash
node patch.js                           # auto-detect Qobuz path
node patch.js "C:\path\to\Qobuz"        # custom path
node patch.js --restore                  # undo all changes
```

### Shell (Git Bash / WSL)

```bash
./install.sh                            # auto-detect
./install.sh "/c/path/to/Qobuz"         # custom path
./install.sh --restore                  # undo
```

The patch is **idempotent** — running it again will restore and re-apply automatically. Backups of the original files are created on first run.

## How it works

The patch modifies two files in the Qobuz app directory and adds two new files:

| File | Change |
|------|--------|
| `main-win32.js` | Replaces the empty SMTC stub (webpack module 80725) with a full implementation. Hooks `sendMusicInfo` for position data. |
| `app.html` | Loads `smtc-renderer.js` after the app bundle. |
| `smtc-renderer.js` | Sets up `navigator.mediaSession` with action handlers and metadata. |
| `smtc-tone.wav` | Generated on first run (~480 KB). Sub-audible tone for SMTC activation. |

### Architecture

```
Main Process (smtc-main.js)                    Renderer (smtc-renderer.js)
┌─────────────────────────┐                    ┌──────────────────────────┐
│ setInfo(track, playing)  │──executeJS──────▶│ window.__smtc.setMetadata │
│ 1s interval (state sync) │──executeJS──────▶│ window.__smtc.setState    │
│ sendMusicInfo hook       │──global var─────▶│ window.__smtc.setPosition │
│                          │                   │                          │
│ ipcMain.__smtc_play  ◀───│──ipc.send────────│ mediaSession action       │
│ → mediaActions.toggle    │                   │ handlers (play/pause/...) │
│                          │                   │                          │
│ globalShortcut disabled  │                   │ <audio> sub-audible tone  │
│ (Chromium handles keys)  │                   │ (activates SMTC bridge)   │
└─────────────────────────┘                    └──────────────────────────┘
```

## Restoring

```bash
node patch.js --restore
```

This restores the original `main-win32.js` and `app.html` from backup files created during the first patch.

## Limitations

- Patch must be re-applied after Qobuz updates (the app version directory changes)
- The sub-audible tone uses minimal resources but does create a real audio stream
- Tested on Qobuz 8.1.0 / Electron 32 — may need adjustments for other versions

## License

MIT

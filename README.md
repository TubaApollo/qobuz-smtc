# Qobuz SMTC Dirty Fix

Brings back Windows media controls to Qobuz Desktop (broken since v7.2.0).

![screenshot](screenshot.png)

## Install

1. Get [Node.js](https://nodejs.org) (v16+)
2. Close Qobuz
3. Double-click `install.bat`
4. Start Qobuz

Undo: `node patch.js --restore`

Custom path: `node patch.js "C:\path\to\Qobuz"`

## What you get

- Track info + cover art in Windows media overlay
- Play/pause/next/prev/seek from Windows UI
- Media key support
- Live seek bar

## Notes

- Re-run after Qobuz updates
- Safe to run multiple times (auto-restores before re-patching)
- Tested on Qobuz 8.1.0 / Windows 11

## License

MIT

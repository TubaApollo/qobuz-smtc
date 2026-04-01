# Qobuz SMTC Fix

Brings back Windows media controls to Qobuz Desktop (broken since v7.2.0).

![screenshot](screenshot.png)

## Install

1. Get [Node.js](https://nodejs.org) (v18+)
2. Close Qobuz
3. Double-click `install.bat`
4. Choose **[1] Prebuild** (fast) or **[2] Build from source** (recommended)
5. Start Qobuz

Undo: `node patch.js --restore`

Custom path: `node patch.js "C:\path\to\Qobuz"`

### Build from source

Requires [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with C++ workload.

```
npm install --ignore-scripts
node scripts/build-for-qobuz.js
node patch.js
```

## What you get

- Track info + cover art in Windows media overlay
- Play/pause/next/prev/seek from Windows UI
- Media key support
- Live seek bar

## Notes

- Re-run after Qobuz updates
- Safe to run multiple times (auto-restores before re-patching)
- Prebuild is compiled for Electron 32.3.3 / Qobuz 8.1.0 — build from source if your version differs
- **This modifies your local Qobuz installation and may violate the Qobuz Terms of Service. Use at your own risk.**
- Tested on Qobuz 8.1.0 / Windows 11

## License

MIT

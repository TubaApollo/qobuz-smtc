#!/usr/bin/env bash
#
# Qobuz SMTC Patch — Installer
#
# Adds Windows System Media Transport Controls (SMTC) to Qobuz Desktop.
# Shows track metadata, artwork, playback controls, and seek position
# in the Windows media overlay, taskbar, and lock screen.
#
# Usage:
#   ./install.sh                          Install (auto-detect Qobuz path)
#   ./install.sh "C:/path/to/Qobuz"      Install with custom path
#   ./install.sh --restore                Restore original files
#
# Prerequisites:
#   - Node.js v16+ in PATH
#   - Qobuz Desktop installed
#   - Close Qobuz before running
#
# The following files must be in the same directory as this script:
#   patch.js           Patcher (applies changes to main-win32.js and app.html)
#   smtc-main.js       Main process module (replaces empty SMTC stub)
#   smtc-renderer.js   Renderer module (sets up navigator.mediaSession)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# -- Check Node.js ----------------------------------------------------------

if ! command -v node &>/dev/null; then
  echo "Error: Node.js is required. Install it from https://nodejs.org"
  exit 1
fi

# -- Check required files ---------------------------------------------------

for f in patch.js smtc-main.js smtc-renderer.js; do
  if [ ! -f "$SCRIPT_DIR/$f" ]; then
    echo "Error: Missing file '$f' in $SCRIPT_DIR"
    exit 1
  fi
done

# -- Run patcher ------------------------------------------------------------

node "$SCRIPT_DIR/patch.js" "$@"

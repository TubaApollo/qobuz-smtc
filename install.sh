#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v node &>/dev/null; then
  echo "Error: Node.js is required. Install it from https://nodejs.org"
  exit 1
fi

for f in patch.js smtc-main.js binding.gyp; do
  if [ ! -f "$SCRIPT_DIR/$f" ]; then
    echo "Error: Missing file '$f' in $SCRIPT_DIR"
    exit 1
  fi
done

# Install dependencies if needed
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
  echo "Installing dependencies..."
  cd "$SCRIPT_DIR" && npm install --ignore-scripts
fi

# Build native addon
echo ""
echo "Building native SMTC addon..."
node "$SCRIPT_DIR/scripts/build-for-qobuz.js" "$@"

# Apply patch
echo ""
echo "Applying patch..."
node "$SCRIPT_DIR/patch.js" "$@"

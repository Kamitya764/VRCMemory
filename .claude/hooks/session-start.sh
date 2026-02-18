#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-/home/user/VRCMemory}"

echo "=== VRCMemory: Installing dependencies ==="

# 1. Install Tauri system dependencies (GTK, WebKit for Linux)
if ! pkg-config --exists gtk+-3.0 2>/dev/null; then
  echo "Installing Tauri system dependencies..."
  apt-get update -qq 2>/dev/null
  apt-get install -y -qq \
    libgtk-3-dev \
    libwebkit2gtk-4.1-dev \
    libjavascriptcoregtk-4.1-dev \
    libsoup-3.0-dev \
    libglib2.0-dev \
    libpango1.0-dev \
    libatk1.0-dev \
    libgdk-pixbuf-2.0-dev \
    2>/dev/null || true
fi

# 2. Install Node.js dependencies (frontend)
echo "Installing Node.js dependencies..."
cd "$PROJECT_DIR"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# 3. Install Tauri CLI if not present
if ! command -v cargo-tauri &>/dev/null; then
  echo "Installing Tauri CLI..."
  cargo install tauri-cli --version "^2" 2>&1 | tail -3
fi

# 4. Fetch Rust dependencies (cargo will cache them)
echo "Fetching Rust dependencies..."
cd "$PROJECT_DIR/src-tauri"
cargo fetch 2>&1 | tail -5

# 5. Set up environment variables for the session
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export VRCMEMORY_PROJECT_DIR=\"$PROJECT_DIR\"" >> "$CLAUDE_ENV_FILE"
fi

echo "=== VRCMemory: Dependencies installed ==="

#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUT_DIR="${1:-$REPO_ROOT/dist/usb}"
ARCHIVE_PATH="$OUT_DIR/carwash-usb-seed.tar.gz"

mkdir -p "$OUT_DIR"
rm -f "$ARCHIVE_PATH"

tar \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.venv-ocr' \
  --exclude='dist/usb' \
  --exclude='temp' \
  --exclude='logs' \
  --exclude='.run' \
  --exclude='*.log' \
  -czf "$ARCHIVE_PATH" \
  -C "$REPO_ROOT" \
  .

echo "Seed archive created: $ARCHIVE_PATH"

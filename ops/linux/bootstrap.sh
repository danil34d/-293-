#!/usr/bin/env bash

set -euo pipefail

APP_ROOT="${CARWASH_APP_ROOT:-$HOME/apps/carwash-app}"
NODE_HOME="${CARWASH_NODE_HOME:-$HOME/opt/node}"
NODE_PARENT_DIR="$(dirname "$NODE_HOME")"

sudo apt-get update
sudo apt-get install -y curl python3 python3-venv build-essential pkg-config sqlite3 libgl1 libglib2.0-0 libgomp1 git xz-utils

mkdir -p "$NODE_PARENT_DIR" "$(dirname "$APP_ROOT")"

if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q '^v20\.'; then
  node_tar="$(curl -fsSL https://nodejs.org/dist/latest-v20.x/SHASUMS256.txt | awk '/linux-x64.tar.xz$/ { print $2; exit }')"
  rm -rf "$NODE_HOME" "$NODE_PARENT_DIR"/node-v20.*
  curl -fsSL "https://nodejs.org/dist/latest-v20.x/$node_tar" -o "/tmp/$node_tar"
  tar -xJf "/tmp/$node_tar" -C "$NODE_PARENT_DIR"
  ln -sfn "$NODE_PARENT_DIR/${node_tar%.tar.xz}" "$NODE_HOME"
fi

profile_line='export PATH="$HOME/opt/node/bin:$PATH"'
grep -qxF "$profile_line" "$HOME/.profile" || echo "$profile_line" >> "$HOME/.profile"

export PATH="$NODE_HOME/bin:$PATH"

node -v
npm -v
python3 --version

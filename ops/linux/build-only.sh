#!/usr/bin/env bash

set -euo pipefail

APP_ROOT="${CARWASH_APP_ROOT:-$HOME/apps/carwash-app}"
NODE_HOME="${CARWASH_NODE_HOME:-$HOME/opt/node}"

export PATH="$NODE_HOME/bin:$PATH"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"

cd "$APP_ROOT"
npm run build

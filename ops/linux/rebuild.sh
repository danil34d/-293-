#!/usr/bin/env bash

set -euo pipefail

APP_ROOT="${CARWASH_APP_ROOT:-$HOME/apps/carwash-app}"
NODE_HOME="${CARWASH_NODE_HOME:-$HOME/opt/node}"

export PATH="$NODE_HOME/bin:$PATH"

cd "$APP_ROOT"
rm -rf node_modules

bash scripts/linux-prepare.sh
npm run build

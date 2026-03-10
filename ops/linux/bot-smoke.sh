#!/usr/bin/env bash

set -euo pipefail

APP_ROOT="${CARWASH_APP_ROOT:-$HOME/apps/carwash-app}"
NODE_HOME="${CARWASH_NODE_HOME:-$HOME/opt/node}"

export PATH="$NODE_HOME/bin:$PATH"

cd "$APP_ROOT"

set +e
timeout 20s npm run bot:telegram
status=$?
set -e

if [[ $status -eq 124 ]]; then
  echo "BOT_TIMEOUT_OK"
  exit 0
fi

exit $status

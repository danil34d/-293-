#!/usr/bin/env bash

set -euo pipefail

APP_ROOT="${CARWASH_APP_ROOT:-$HOME/apps/carwash-app}"
NODE_HOME="${CARWASH_NODE_HOME:-$HOME/opt/node}"
RUN_DIR="$APP_ROOT/.run"
LOG_DIR="$APP_ROOT/logs"

export PATH="$NODE_HOME/bin:$PATH"

mkdir -p "$RUN_DIR" "$LOG_DIR"

if [[ -f "$RUN_DIR/next.pid" ]]; then
  old_pid="$(cat "$RUN_DIR/next.pid" || true)"
  if [[ -n "${old_pid:-}" ]] && kill -0 "$old_pid" 2>/dev/null; then
    kill "$old_pid" || true
    sleep 2
  fi
fi

cd "$APP_ROOT"
nohup ./node_modules/.bin/next start -H 0.0.0.0 -p 3000 > "$LOG_DIR/next.log" 2>&1 < /dev/null &
echo $! > "$RUN_DIR/next.pid"
sleep 8

curl -I --max-time 10 http://127.0.0.1:3000/login

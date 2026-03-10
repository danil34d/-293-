#!/usr/bin/env bash

set -euo pipefail

APP_ROOT="${CARWASH_APP_ROOT:-$HOME/apps/carwash-app}"
NODE_HOME="${CARWASH_NODE_HOME:-$HOME/opt/node}"
RUN_DIR="$APP_ROOT/.run"
LOG_DIR="$APP_ROOT/logs"

export PATH="$NODE_HOME/bin:$PATH"

mkdir -p "$RUN_DIR" "$LOG_DIR"

if [[ -f "$RUN_DIR/tg-bot.pid" ]]; then
  old_pid="$(cat "$RUN_DIR/tg-bot.pid" || true)"
  if [[ -n "${old_pid:-}" ]] && kill -0 "$old_pid" 2>/dev/null; then
    kill "$old_pid" || true
    sleep 2
  fi
fi

cd "$APP_ROOT"
nohup npm run bot:telegram > "$LOG_DIR/tg-bot.log" 2>&1 < /dev/null &
echo $! > "$RUN_DIR/tg-bot.pid"
sleep 8

tail -n 20 "$LOG_DIR/tg-bot.log"

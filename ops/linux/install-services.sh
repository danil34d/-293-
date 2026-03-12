#!/usr/bin/env bash

set -euo pipefail

APP_ROOT="${CARWASH_APP_ROOT:-$HOME/apps/carwash-app}"
NODE_HOME="${CARWASH_NODE_HOME:-$HOME/opt/node}"
CARWASH_USER="${CARWASH_USER:-$USER}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_DIR="$SCRIPT_DIR/systemd"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

for pid_file in "$APP_ROOT/.run/next.pid" "$APP_ROOT/.run/tg-bot.pid"; do
  if [[ -f "$pid_file" ]]; then
    pid="$(cat "$pid_file" || true)"
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" || true
    fi
  fi
done

render_unit() {
  local src="$1"
  local dst="$2"

  sed \
    -e "s|__CARWASH_USER__|$CARWASH_USER|g" \
    -e "s|__CARWASH_APP_ROOT__|$APP_ROOT|g" \
    -e "s|__CARWASH_NODE_BIN_DIR__|$NODE_HOME/bin|g" \
    "$src" > "$dst"
}

render_unit "$TEMPLATE_DIR/carwash-web.service.tpl" "$TMP_DIR/carwash-web.service"
render_unit "$TEMPLATE_DIR/carwash-bot.service.tpl" "$TMP_DIR/carwash-bot.service"
render_unit "$TEMPLATE_DIR/carwash-ocr-worker.service.tpl" "$TMP_DIR/carwash-ocr-worker.service"

sudo install -m 0644 "$TMP_DIR/carwash-web.service" /etc/systemd/system/carwash-web.service
sudo install -m 0644 "$TMP_DIR/carwash-bot.service" /etc/systemd/system/carwash-bot.service
sudo install -m 0644 "$TMP_DIR/carwash-ocr-worker.service" /etc/systemd/system/carwash-ocr-worker.service
sudo systemctl daemon-reload
sudo systemctl enable --now carwash-ocr-worker.service carwash-web.service carwash-bot.service
sleep 5
sudo systemctl --no-pager --full status carwash-ocr-worker.service carwash-web.service carwash-bot.service

#!/usr/bin/env bash

set -euo pipefail

APP_ROOT="${CARWASH_APP_ROOT:-$HOME/apps/carwash-app}"
ARCHIVE_PATH="${CARWASH_ARCHIVE_PATH:-$HOME/apps/carwash-vm-deploy.tar}"
NODE_HOME="${CARWASH_NODE_HOME:-$HOME/opt/node}"

export PATH="$NODE_HOME/bin:$PATH"

rm -rf "$APP_ROOT"
mkdir -p "$APP_ROOT"
tar -xf "$ARCHIVE_PATH" -C "$APP_ROOT"

if [[ -f "$APP_ROOT/.env.local" ]]; then
  sed -i 's#^TELEGRAM_APP_BASE_URL=.*#TELEGRAM_APP_BASE_URL=http://127.0.0.1:3000#' "$APP_ROOT/.env.local"
fi

if [[ -f "$APP_ROOT/telegram-bot/.env.local" ]]; then
  sed -i 's#^TELEGRAM_APP_BASE_URL=.*#TELEGRAM_APP_BASE_URL=http://127.0.0.1:3000#' "$APP_ROOT/telegram-bot/.env.local"
fi

cd "$APP_ROOT"

bash scripts/linux-prepare.sh
npm run build

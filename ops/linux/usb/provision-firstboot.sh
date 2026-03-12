#!/usr/bin/env bash

set -euo pipefail

if [[ -f /etc/default/carwash ]]; then
  # shellcheck disable=SC1091
  source /etc/default/carwash
fi

CARWASH_USER="${CARWASH_USER:-carwash}"
CARWASH_MOUNT_POINT="${CARWASH_MOUNT_POINT:-/srv/carwash}"
CARWASH_APP_ROOT="${CARWASH_APP_ROOT:-/srv/carwash/app}"
CARWASH_DATA_ROOT="${CARWASH_DATA_ROOT:-/srv/carwash/data}"
CARWASH_LOG_ROOT="${CARWASH_LOG_ROOT:-/srv/carwash/logs}"
CARWASH_BACKUP_ROOT="${CARWASH_BACKUP_ROOT:-/srv/carwash/backups}"
CARWASH_NODE_HOME="${CARWASH_NODE_HOME:-/srv/carwash/opt/node}"
CARWASH_OCR_VENV="${CARWASH_OCR_VENV:-/srv/carwash/.venv-ocr}"
CARWASH_MODEL_ROOT="${CARWASH_MODEL_ROOT:-/srv/carwash/.EasyOCR}"
CARWASH_ARCHIVE_PATH="${CARWASH_ARCHIVE_PATH:-/opt/carwash-seed/carwash-usb-seed.tar.gz}"
STATUS_DIR="/var/lib/carwash"
STATUS_HTML="$STATUS_DIR/status.html"
MARKER_FILE="$CARWASH_MOUNT_POINT/.carwash-provisioned"

write_status_html() {
  local title="$1"
  local message="$2"

  mkdir -p "$STATUS_DIR"
  cat > "$STATUS_HTML" <<EOF
<!doctype html>
<html>
  <head><meta charset="utf-8"><title>$title</title></head>
  <body style="font-family: sans-serif; padding: 2rem;">
    <h1>$title</h1>
    <pre style="white-space: pre-wrap;">$message</pre>
  </body>
</html>
EOF
}

run_as_carwash() {
  local cmd="$1"

  sudo -u "$CARWASH_USER" env \
    HOME="/home/$CARWASH_USER" \
    PATH="$CARWASH_NODE_HOME/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    CARWASH_APP_ROOT="$CARWASH_APP_ROOT" \
    CARWASH_NODE_HOME="$CARWASH_NODE_HOME" \
    CARWASH_OCR_VENV="$CARWASH_OCR_VENV" \
    NODE_ENV="${NODE_ENV:-production}" \
    NODE_OPTIONS="${NODE_OPTIONS:-}" \
    PLATE_READER_PYTHON="${PLATE_READER_PYTHON:-$CARWASH_OCR_VENV/bin/python}" \
    EASYOCR_MODULE_PATH="${EASYOCR_MODULE_PATH:-$CARWASH_MODEL_ROOT}" \
    bash -lc "$cmd"
}

run_bootstrap_as_root() {
  local cmd="$1"

  HOME="/home/$CARWASH_USER" \
    CARWASH_APP_ROOT="$CARWASH_APP_ROOT" \
    CARWASH_NODE_HOME="$CARWASH_NODE_HOME" \
    bash -lc "$cmd"
}

ensure_storage() {
  /usr/local/bin/carwash-storage-ensure.sh --no-create
}

prepare_layout() {
  mkdir -p \
    "$CARWASH_MOUNT_POINT" \
    "$CARWASH_APP_ROOT" \
    "$CARWASH_DATA_ROOT" \
    "$CARWASH_LOG_ROOT" \
    "$CARWASH_BACKUP_ROOT" \
    "$CARWASH_NODE_HOME" \
    "$CARWASH_OCR_VENV" \
    "$CARWASH_MODEL_ROOT"

  if [[ ! -f "$CARWASH_APP_ROOT/package.json" ]]; then
    rm -rf "$CARWASH_APP_ROOT"
    mkdir -p "$CARWASH_APP_ROOT"
    tar -xf "$CARWASH_ARCHIVE_PATH" -C "$CARWASH_APP_ROOT"
  fi

  rm -rf "$CARWASH_APP_ROOT/data" "$CARWASH_APP_ROOT/logs" "$CARWASH_APP_ROOT/.venv-ocr"
  ln -sfn "$CARWASH_DATA_ROOT" "$CARWASH_APP_ROOT/data"
  ln -sfn "$CARWASH_LOG_ROOT" "$CARWASH_APP_ROOT/logs"
  ln -sfn "$CARWASH_OCR_VENV" "$CARWASH_APP_ROOT/.venv-ocr"

  install -d -m 0755 "/home/$CARWASH_USER/Desktop"
  ln -sfn "$CARWASH_APP_ROOT" "/home/$CARWASH_USER/Project"
  ln -sfn "$CARWASH_MODEL_ROOT" "/home/$CARWASH_USER/.EasyOCR"

  chown -R "$CARWASH_USER:$CARWASH_USER" "$CARWASH_MOUNT_POINT" "/home/$CARWASH_USER/.EasyOCR" "/home/$CARWASH_USER/Project"
}

prepare_env_files() {
  if [[ ! -f "$CARWASH_APP_ROOT/.env.local" && -f "$CARWASH_APP_ROOT/.env.example" ]]; then
    cp "$CARWASH_APP_ROOT/.env.example" "$CARWASH_APP_ROOT/.env.local"
  fi

  if [[ ! -f "$CARWASH_APP_ROOT/telegram-bot/.env.local" && -f "$CARWASH_APP_ROOT/telegram-bot/.env.example" ]]; then
    cp "$CARWASH_APP_ROOT/telegram-bot/.env.example" "$CARWASH_APP_ROOT/telegram-bot/.env.local"
  fi

  for env_file in "$CARWASH_APP_ROOT/.env.local" "$CARWASH_APP_ROOT/telegram-bot/.env.local"; do
    [[ -f "$env_file" ]] || continue

    if grep -q '^TELEGRAM_APP_BASE_URL=' "$env_file"; then
      sed -i 's#^TELEGRAM_APP_BASE_URL=.*#TELEGRAM_APP_BASE_URL=http://127.0.0.1:3000#' "$env_file"
    else
      echo 'TELEGRAM_APP_BASE_URL=http://127.0.0.1:3000' >> "$env_file"
    fi
  done

  chown "$CARWASH_USER:$CARWASH_USER" "$CARWASH_APP_ROOT/.env.local" "$CARWASH_APP_ROOT/telegram-bot/.env.local" 2>/dev/null || true
}

main() {
  if [[ -f "$MARKER_FILE" && -f "$CARWASH_APP_ROOT/node_modules/.bin/next" ]]; then
    echo "Carwash provision already completed."
    exit 0
  fi

  if [[ ! -f "$CARWASH_ARCHIVE_PATH" ]]; then
    write_status_html "Carwash seed archive missing" "Seed archive not found: $CARWASH_ARCHIVE_PATH"
    echo "Seed archive not found: $CARWASH_ARCHIVE_PATH" >&2
    exit 1
  fi

  write_status_html "Carwash provisioning" "Preparing storage..."
  ensure_storage

  write_status_html "Carwash provisioning" "Preparing filesystem layout..."
  prepare_layout
  prepare_env_files

  write_status_html "Carwash provisioning" "Installing Linux runtime dependencies..."
  run_bootstrap_as_root "cd '$CARWASH_APP_ROOT' && bash ops/linux/bootstrap.sh"
  chown -R "$CARWASH_USER:$CARWASH_USER" "$CARWASH_NODE_HOME" "/home/$CARWASH_USER"

  write_status_html "Carwash provisioning" "Installing Node.js and OCR dependencies..."
  run_as_carwash "cd '$CARWASH_APP_ROOT' && bash scripts/linux-prepare.sh --with-ocr"

  write_status_html "Carwash provisioning" "Building Next.js application..."
  run_as_carwash "cd '$CARWASH_APP_ROOT' && npm run build"

  chown -R "$CARWASH_USER:$CARWASH_USER" "$CARWASH_MOUNT_POINT"
  touch "$MARKER_FILE"

  /usr/local/bin/carwash-configure-xfce-kiosk.sh || true
  /usr/local/bin/carwash-install-desktop-apps.sh || true

  systemctl restart carwash-ocr-worker.service || true
  systemctl restart carwash-web.service || true
  systemctl restart carwash-bot.service || true

  rm -f "$STATUS_HTML"
  echo "Carwash first-boot provisioning completed."
}

main "$@"

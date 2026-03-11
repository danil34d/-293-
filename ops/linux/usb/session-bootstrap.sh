#!/usr/bin/env bash

set -euo pipefail

if [[ -f /etc/default/carwash ]]; then
  set -a
  # shellcheck disable=SC1091
  source /etc/default/carwash
  set +a
fi

APP_URL="${CARWASH_UI_URL:-http://127.0.0.1:3000/login}"
STATUS_HTML="/var/lib/carwash/status.html"
WAIT_TIMEOUT_SEC="${CARWASH_UI_WAIT_TIMEOUT_SEC:-180}"
FIREFOX_BIN="${CARWASH_FIREFOX_BIN:-firefox}"
FIREFOX_PROFILE="${CARWASH_FIREFOX_PROFILE:-}"
FIREFOX_KIOSK="${CARWASH_FIREFOX_KIOSK:-false}"
FIREFOX_CLEAN_START="${CARWASH_FIREFOX_CLEAN_START:-false}"

profile_instance_running() {
  [[ -n "$FIREFOX_PROFILE" ]] || return 1
  ps -u "$(id -u)" -o args= | grep -F -- "$FIREFOX_BIN" | grep -F -- "--profile $FIREFOX_PROFILE" >/dev/null 2>&1
}

stop_profile_instance() {
  [[ -n "$FIREFOX_PROFILE" ]] || return 0
  pkill -9 -u "$(id -u)" -f -- "--profile $FIREFOX_PROFILE" || true
  pkill -9 -u "$(id -u)" -f -- "$FIREFOX_PROFILE" || true
}

clear_profile_locks() {
  [[ -n "$FIREFOX_PROFILE" ]] || return 0
  rm -f "$FIREFOX_PROFILE/lock" "$FIREFOX_PROFILE/.parentlock"
  find "$FIREFOX_PROFILE" -maxdepth 1 -type s -name '.parentlock-*' -delete 2>/dev/null || true
}

build_firefox_args() {
  local target_url="$1"
  local args=()

  if [[ -n "$FIREFOX_PROFILE" ]]; then
    mkdir -p "$FIREFOX_PROFILE"
    args+=(--new-instance --profile "$FIREFOX_PROFILE")
  fi

  if [[ "$FIREFOX_KIOSK" == "true" ]]; then
    args+=(--kiosk)
  else
    args+=(--new-window)
  fi

  args+=("$target_url")
  printf '%s\n' "${args[@]}"
}

open_firefox() {
  local target_url="$1"
  mapfile -t args < <(build_firefox_args "$target_url")
  exec "$FIREFOX_BIN" "${args[@]}"
}

if profile_instance_running; then
  stop_profile_instance
  sleep 2
fi

if pgrep -u "$(id -u)" -x firefox >/dev/null 2>&1; then
  if [[ "$FIREFOX_CLEAN_START" == "true" ]]; then
    pkill -9 -u "$(id -u)" -f '/opt/firefox|firefox' || true
    sleep 3
  fi
fi

clear_profile_locks

deadline=$((SECONDS + WAIT_TIMEOUT_SEC))
while (( SECONDS < deadline )); do
  if curl -fsS "$APP_URL" >/dev/null 2>&1; then
    open_firefox "$APP_URL"
  fi
  sleep 2
done

if [[ -f "$STATUS_HTML" ]]; then
  open_firefox "file://$STATUS_HTML"
fi

cat > "$STATUS_HTML" <<'EOF'
<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Carwash boot status</title></head>
  <body style="font-family: sans-serif; padding: 2rem;">
    <h1>Carwash is not ready yet</h1>
    <p>The local web service did not come up in time.</p>
    <p>Open a terminal and inspect the provision/services logs.</p>
  </body>
</html>
EOF

open_firefox "file://$STATUS_HTML"

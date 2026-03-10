#!/usr/bin/env bash

set -euo pipefail

APP_URL="${CARWASH_UI_URL:-http://127.0.0.1:3000/login}"
STATUS_HTML="/var/lib/carwash/status.html"
WAIT_TIMEOUT_SEC="${CARWASH_UI_WAIT_TIMEOUT_SEC:-180}"

if pgrep -u "$(id -u)" -x firefox >/dev/null 2>&1; then
  exit 0
fi

deadline=$((SECONDS + WAIT_TIMEOUT_SEC))
while (( SECONDS < deadline )); do
  if curl -fsS "$APP_URL" >/dev/null 2>&1; then
    exec firefox --new-window "$APP_URL"
  fi
  sleep 2
done

if [[ -f "$STATUS_HTML" ]]; then
  exec firefox --new-window "file://$STATUS_HTML"
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

exec firefox --new-window "file://$STATUS_HTML"

#!/usr/bin/env bash

set -euo pipefail

service_state() {
  local unit="$1"
  if systemctl is-active --quiet "$unit"; then
    printf 'OK'
  else
    printf 'DOWN'
  fi
}

WEB_STATE="$(service_state carwash-web.service)"
BOT_STATE="$(service_state carwash-bot.service)"
OCR_STATE="$(service_state carwash-ocr-worker.service)"
TAILSCALE_STATE="$(service_state tailscaled.service)"
HOSTNAME_VALUE="$(hostname -s)"

printf '<txt>%s | WEB:%s BOT:%s OCR:%s</txt>\n' \
  "$HOSTNAME_VALUE" "$WEB_STATE" "$BOT_STATE" "$OCR_STATE"
printf '<tool>web: %s\nbot: %s\nocr: %s\ntailscale: %s\nwallboard: http://127.0.0.1:3000/wallboard</tool>\n' \
  "$WEB_STATE" "$BOT_STATE" "$OCR_STATE" "$TAILSCALE_STATE"

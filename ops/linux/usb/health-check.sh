#!/usr/bin/env bash

set -euo pipefail

if [[ -f /etc/default/carwash ]]; then
  # shellcheck disable=SC1091
  source /etc/default/carwash
fi

CARWASH_HEALTHCHECK_URL="${CARWASH_HEALTHCHECK_URL:-http://127.0.0.1:3000/login}"
CARWASH_HEALTHCHECK_TIMEOUT_SEC="${CARWASH_HEALTHCHECK_TIMEOUT_SEC:-15}"
CARWASH_HEALTHCHECK_RESTART_DELAY_SEC="${CARWASH_HEALTHCHECK_RESTART_DELAY_SEC:-10}"
PLATE_WORKER_URL="${PLATE_WORKER_URL:-}"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

log() {
  logger -t carwash-health-check "$1"
  echo "$1"
}

restart_web=0
restart_ocr=0

if systemctl list-unit-files carwash-ocr-worker.service >/dev/null 2>&1; then
  if ! systemctl is-active --quiet carwash-ocr-worker.service; then
    log "carwash-ocr-worker.service is inactive; restarting"
    systemctl restart carwash-ocr-worker.service
    restart_ocr=1
  elif [[ -n "$PLATE_WORKER_URL" ]] && ! curl -fsS --max-time "$CARWASH_HEALTHCHECK_TIMEOUT_SEC" "${PLATE_WORKER_URL%/}/health" >/dev/null; then
    log "ocr worker health endpoint failed; restarting carwash-ocr-worker.service"
    systemctl restart carwash-ocr-worker.service
    restart_ocr=1
  fi
fi

if ! systemctl is-active --quiet carwash-web.service; then
  log "carwash-web.service is inactive; restarting"
  systemctl restart carwash-web.service
  restart_web=1
fi

if ! curl -fsS --max-time "$CARWASH_HEALTHCHECK_TIMEOUT_SEC" "$CARWASH_HEALTHCHECK_URL" >/dev/null; then
  log "web health endpoint failed; restarting carwash-web.service"
  systemctl restart carwash-web.service
  restart_web=1
fi

if [[ "$restart_web" == "1" || "$restart_ocr" == "1" ]]; then
  sleep "$CARWASH_HEALTHCHECK_RESTART_DELAY_SEC"
fi

if ! systemctl is-active --quiet carwash-bot.service; then
  log "carwash-bot.service is inactive; restarting"
  systemctl restart carwash-bot.service
elif [[ "$restart_web" == "1" ]]; then
  log "web service restarted; restarting carwash-bot.service to rebind internal API"
  systemctl restart carwash-bot.service
fi

if ! curl -fsS --max-time "$CARWASH_HEALTHCHECK_TIMEOUT_SEC" "$CARWASH_HEALTHCHECK_URL" >/dev/null; then
  log "health-check still failing after restart attempt"
  exit 1
fi

#!/usr/bin/env bash

set -euo pipefail

if [[ -f /etc/default/carwash ]]; then
  set -a
  # shellcheck disable=SC1091
  source /etc/default/carwash
  set +a
fi

FIREFOX_PROFILE="${1:-${CARWASH_FIREFOX_PROFILE:-}}"
CURRENT_UID="$(id -u)"

if [[ -n "$FIREFOX_PROFILE" ]]; then
  pkill -9 -u "$CURRENT_UID" -f -- "--profile $FIREFOX_PROFILE" || true
  pkill -9 -u "$CURRENT_UID" -f -- "$FIREFOX_PROFILE" || true
  rm -f "$FIREFOX_PROFILE/lock" "$FIREFOX_PROFILE/.parentlock"
  find "$FIREFOX_PROFILE" -maxdepth 1 -type s -name '.parentlock-*' -delete 2>/dev/null || true
else
  pkill -9 -u "$CURRENT_UID" -x firefox || true
fi

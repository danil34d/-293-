#!/usr/bin/env bash

set -euo pipefail

if [[ -f /etc/default/carwash ]]; then
  # shellcheck disable=SC1091
  source /etc/default/carwash
fi

CARWASH_WEB_PORT="${CARWASH_WEB_PORT:-3000}"
CARWASH_SSH_PORT="${CARWASH_SSH_PORT:-22}"
CARWASH_RDP_PORT="${CARWASH_RDP_PORT:-3389}"
CARWASH_FIREWALL_ALLOW_RDP="${CARWASH_FIREWALL_ALLOW_RDP:-true}"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

if ! command -v ufw >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ufw
fi

# Keep the rule set deterministic for this appliance-like install.
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow "${CARWASH_SSH_PORT}/tcp" comment 'Carwash SSH'
ufw allow "${CARWASH_WEB_PORT}/tcp" comment 'Carwash Web'

if [[ "${CARWASH_FIREWALL_ALLOW_RDP,,}" == "true" ]]; then
  ufw allow "${CARWASH_RDP_PORT}/tcp" comment 'Carwash RDP'
fi

ufw --force enable
ufw status verbose

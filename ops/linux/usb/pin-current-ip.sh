#!/usr/bin/env bash

set -euo pipefail

if [[ -f /etc/default/carwash ]]; then
  # shellcheck disable=SC1091
  source /etc/default/carwash
fi

CARWASH_BACKUP_ROOT="${CARWASH_BACKUP_ROOT:-/srv/carwash/backups}"
APPLY_NOW=0

if [[ "${1:-}" == "--apply-now" ]]; then
  APPLY_NOW=1
fi

if [[ $EUID -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_cmd nmcli
need_cmd ip

readarray -t active_fields < <(nmcli -t -f NAME,TYPE,DEVICE connection show --active)

connection_name=""
device_name=""
for entry in "${active_fields[@]}"; do
  IFS=':' read -r name type device <<< "$entry"
  if [[ "$type" == "802-3-ethernet" && -n "$device" ]]; then
    connection_name="$name"
    device_name="$device"
    break
  fi
done

if [[ -z "$connection_name" || -z "$device_name" ]]; then
  echo "No active ethernet NetworkManager connection found." >&2
  exit 1
fi

cidr="$(ip -4 -o addr show dev "$device_name" scope global | awk '{print $4; exit}')"
gateway="$(ip route show default dev "$device_name" | awk '/default/ { print $3; exit }')"
dns_server="$(resolvectl dns "$device_name" 2>/dev/null | awk 'NR==1 { print $NF }')"

if [[ -z "$cidr" || -z "$gateway" ]]; then
  echo "Could not detect current IPv4 address or gateway for $device_name." >&2
  exit 1
fi

if [[ -z "$dns_server" ]]; then
  dns_server="$gateway"
fi

backup_dir="$CARWASH_BACKUP_ROOT/network"
timestamp="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup_dir"
nmcli connection show "$connection_name" > "$backup_dir/network-profile-$timestamp.txt"

nmcli connection modify "$connection_name" \
  connection.autoconnect yes \
  ipv4.method manual \
  ipv4.addresses "$cidr" \
  ipv4.gateway "$gateway" \
  ipv4.dns "$dns_server" \
  ipv4.ignore-auto-dns yes

echo "Pinned current IP profile:"
echo "  connection: $connection_name"
echo "  device: $device_name"
echo "  ipv4: $cidr"
echo "  gateway: $gateway"
echo "  dns: $dns_server"
echo "  backup: $backup_dir/network-profile-$timestamp.txt"

if [[ "$APPLY_NOW" == "1" ]]; then
  echo "Reapplying connection now..."
  nmcli connection up "$connection_name" ifname "$device_name"
fi

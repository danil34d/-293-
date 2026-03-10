#!/usr/bin/env bash

set -euo pipefail

if [[ -f /etc/default/carwash ]]; then
  # shellcheck disable=SC1091
  source /etc/default/carwash
fi

CARWASH_APP_ROOT="${CARWASH_APP_ROOT:-/srv/carwash/app}"
CARWASH_DATA_ROOT="${CARWASH_DATA_ROOT:-/srv/carwash/data}"
CARWASH_BACKUP_ROOT="${CARWASH_BACKUP_ROOT:-/srv/carwash/backups}"
CARWASH_BACKUP_KEEP_DAYS="${CARWASH_BACKUP_KEEP_DAYS:-14}"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

timestamp="$(date +%Y%m%d-%H%M%S)"
archive_path="$CARWASH_BACKUP_ROOT/carwash-backup-$timestamp.tar.gz"
tmp_manifest="$(mktemp)"
trap 'rm -f "$tmp_manifest"' EXIT

mkdir -p "$CARWASH_BACKUP_ROOT"

paths=(
  "$CARWASH_DATA_ROOT"
  "$CARWASH_APP_ROOT/.env.local"
  "$CARWASH_APP_ROOT/telegram-bot/.env.local"
  "/etc/default/carwash"
  "/etc/systemd/system/carwash-web.service"
  "/etc/systemd/system/carwash-bot.service"
  "/etc/systemd/system/carwash-backup.service"
  "/etc/systemd/system/carwash-backup.timer"
  "/etc/systemd/system/carwash-health-check.service"
  "/etc/systemd/system/carwash-health-check.timer"
  "/etc/systemd/system/carwash-firewall.service"
)

for path in "${paths[@]}"; do
  if [[ -e "$path" ]]; then
    printf '%s\n' "${path#/}" >> "$tmp_manifest"
  fi
done

if [[ ! -s "$tmp_manifest" ]]; then
  echo "Nothing to back up." >&2
  exit 1
fi

tar -C / -czf "$archive_path" --files-from "$tmp_manifest"
ln -sfn "$(basename "$archive_path")" "$CARWASH_BACKUP_ROOT/latest-carwash-backup.tar.gz"
find "$CARWASH_BACKUP_ROOT" -maxdepth 1 -type f -name 'carwash-backup-*.tar.gz' -mtime +"$CARWASH_BACKUP_KEEP_DAYS" -delete

echo "Backup created: $archive_path"

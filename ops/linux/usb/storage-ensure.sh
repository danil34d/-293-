#!/usr/bin/env bash

set -euo pipefail

if [[ -f /etc/default/carwash ]]; then
  # shellcheck disable=SC1091
  source /etc/default/carwash
fi

ALLOW_CREATE=1
if [[ "${1:-}" == "--no-create" ]]; then
  ALLOW_CREATE=0
fi

CARWASH_DATA_LABEL="${CARWASH_DATA_LABEL:-CARWASH_DATA}"
CARWASH_MOUNT_POINT="${CARWASH_MOUNT_POINT:-/srv/carwash}"
CARWASH_MIN_DATA_SIZE_MIB="${CARWASH_MIN_DATA_SIZE_MIB:-20480}"
STATUS_DIR="/var/lib/carwash"
STATUS_HTML="$STATUS_DIR/status.html"

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

clear_status_html() {
  rm -f "$STATUS_HTML"
}

ensure_mount() {
  local device="$1"
  mkdir -p "$CARWASH_MOUNT_POINT"

  if ! grep -q "LABEL=$CARWASH_DATA_LABEL" /etc/fstab 2>/dev/null; then
    local uuid
    uuid="$(blkid -s UUID -o value "$device")"
    if [[ -n "$uuid" ]]; then
      echo "UUID=$uuid $CARWASH_MOUNT_POINT ext4 defaults,nofail 0 2" >> /etc/fstab
    fi
  fi

  if ! mountpoint -q "$CARWASH_MOUNT_POINT"; then
    mount "$CARWASH_MOUNT_POINT"
  fi
}

device_for_label() {
  blkid -L "$CARWASH_DATA_LABEL" 2>/dev/null || true
}

normalize_mib() {
  printf '%s' "$1" | sed 's/MiB$//'
}

existing_mount_device() {
  findmnt -no SOURCE "$CARWASH_MOUNT_POINT" 2>/dev/null || true
}

root_disk_name() {
  local root_source
  root_source="$(findmnt -no SOURCE / || true)"
  if [[ -z "$root_source" ]]; then
    return 0
  fi
  lsblk -no PKNAME "$root_source" 2>/dev/null | head -n 1 || true
}

candidate_disks() {
  local root_disk
  root_disk="$(root_disk_name)"

  while read -r name rm ro type tran; do
    [[ "$type" == "disk" ]] || continue
    [[ "$rm" == "0" ]] || continue
    [[ "$ro" == "0" ]] || continue
    [[ "$name" != "$root_disk" ]] || continue
    [[ "$name" != zram* ]] || continue
    [[ "$name" != loop* ]] || continue
    [[ "$name" != ram* ]] || continue
    [[ "$tran" != "usb" ]] || continue
    echo "/dev/$name"
  done < <(lsblk -dn -o NAME,RM,RO,TYPE,TRAN)

  while read -r name rm ro type tran; do
    [[ "$type" == "disk" ]] || continue
    [[ "$rm" == "0" ]] || continue
    [[ "$ro" == "0" ]] || continue
    [[ "$name" != "$root_disk" ]] || continue
    [[ "$name" != zram* ]] || continue
    [[ "$name" != loop* ]] || continue
    [[ "$name" != ram* ]] || continue
    [[ "$tran" == "usb" ]] && continue
    echo "/dev/$name"
  done < <(lsblk -dn -o NAME,RM,RO,TYPE,TRAN)
}

create_partition_on_empty_disk() {
  local disk="$1"

  wipefs -a "$disk"
  sgdisk --zap-all "$disk"
  parted -s "$disk" mklabel gpt
  parted -s "$disk" unit MiB mkpart primary ext4 1 100%
  partprobe "$disk" || true
  udevadm settle || true
  sleep 2

  lsblk -nrpo NAME,TYPE "$disk" | awk '$2=="part"{print $1}' | tail -n 1
}

create_partition_from_free_space() {
  local disk="$1"
  local created_part=""

  while IFS=':' read -r _ start end size kind _rest; do
    [[ "$kind" == "free" ]] || continue

    local start_mib end_mib size_mib size_int
    start_mib="$(normalize_mib "$start")"
    end_mib="$(normalize_mib "$end")"
    size_mib="$(normalize_mib "$size")"
    size_int="${size_mib%.*}"

    [[ -n "$size_int" ]] || continue
    (( size_int >= CARWASH_MIN_DATA_SIZE_MIB )) || continue

    parted -s "$disk" unit MiB mkpart primary ext4 "$start_mib" "$end_mib"
    partprobe "$disk" || true
    udevadm settle || true
    sleep 2
    created_part="$(lsblk -nrpo NAME,TYPE "$disk" | awk '$2=="part"{print $1}' | tail -n 1)"
    break
  done < <(LC_ALL=C parted -sm "$disk" unit MiB print free)

  printf '%s' "$created_part"
}

format_and_label_partition() {
  local part="$1"
  mkfs.ext4 -F -L "$CARWASH_DATA_LABEL" "$part"
}

main() {
  local mounted_source
  mounted_source="$(existing_mount_device)"
  if [[ -n "$mounted_source" ]]; then
    clear_status_html
    echo "Using existing mount at $CARWASH_MOUNT_POINT from $mounted_source"
    exit 0
  fi

  local existing
  existing="$(device_for_label)"
  if [[ -n "$existing" ]]; then
    ensure_mount "$existing"
    clear_status_html
    echo "Mounted existing $CARWASH_DATA_LABEL at $CARWASH_MOUNT_POINT"
    exit 0
  fi

  if (( ALLOW_CREATE == 0 )); then
    write_status_html "Carwash data partition missing" "Required label $CARWASH_DATA_LABEL was not found."
    echo "Required label $CARWASH_DATA_LABEL was not found." >&2
    exit 1
  fi

  local disk part
  while read -r disk; do
    [[ -n "$disk" ]] || continue

    if ! lsblk -nr "$disk" -o TYPE | grep -q '^part$'; then
      part="$(create_partition_on_empty_disk "$disk")"
    else
      part="$(create_partition_from_free_space "$disk")"
    fi

    if [[ -n "${part:-}" ]]; then
      format_and_label_partition "$part"
      ensure_mount "$part"
      clear_status_html
      echo "Created and mounted $part as $CARWASH_MOUNT_POINT"
      exit 0
    fi
  done < <(candidate_disks)

  write_status_html "Carwash storage not provisioned" "No existing $CARWASH_DATA_LABEL partition was found and no safe free internal disk space was available."
  echo "Could not provision internal storage for $CARWASH_DATA_LABEL." >&2
  exit 1
}

main "$@"

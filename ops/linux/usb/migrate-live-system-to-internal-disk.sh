#!/usr/bin/env bash

set -euo pipefail

TARGET_DISK=""
BACKUP_DIR=""
BOOTLOADER_ID="CarwashInternal"
REUSE_LAYOUT=0

ROOT_SIZE_GIB=50
ARCHIVE_SIZE_GIB=80
DATA_SIZE_GIB=250
BACKUP_SIZE_GIB=150
SHARED_SIZE_GIB=100
MEDIA_SIZE_GIB=150
TEST_SIZE_GIB=80

EFI_START_MIB=3
EFI_END_MIB=515

if [[ -f /etc/default/carwash ]]; then
  # shellcheck disable=SC1091
  source /etc/default/carwash
fi

CARWASH_USER="${CARWASH_USER:-carwash}"
CARWASH_MOUNT_POINT="${CARWASH_MOUNT_POINT:-/srv/carwash}"
CARWASH_BACKUP_ROOT="${CARWASH_BACKUP_ROOT:-/srv/carwash/backups}"
ARCHIVE_MOUNT_POINT="/mnt/archive-keep"
SHARED_MOUNT_POINT="/srv/shared"
MEDIA_MOUNT_POINT="/srv/media"
TEST_MOUNT_POINT="/srv/test"
TARGET_ROOT=""
CHROOT_MOUNTS=()
CARWASH_UID=""
CARWASH_GID=""

usage() {
  cat <<'EOF'
Usage:
  migrate-live-system-to-internal-disk.sh --target-disk /dev/sdX [--backup-dir /var/tmp/path] [--bootloader-id Name] [--reuse-layout]
EOF
}

log() {
  printf '==> %s\n' "$*"
}

require_root() {
  if [[ $EUID -ne 0 ]]; then
    echo "Run as root." >&2
    exit 1
  fi
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

gib_to_mib() {
  local gib="$1"
  printf '%s' $((gib * 1024))
}

normalize_uuid() {
  blkid -s UUID -o value "$1"
}

cleanup() {
  local mountpoint
  if [[ -z "$TARGET_ROOT" || ! -d "$TARGET_ROOT" ]]; then
    return 0
  fi

  for mountpoint in \
    "$TARGET_ROOT/sys/firmware/efi/efivars" \
    "$TARGET_ROOT/dev/pts" \
    "$TARGET_ROOT/dev" \
    "$TARGET_ROOT/proc" \
    "$TARGET_ROOT/sys" \
    "$TARGET_ROOT/run" \
    "$TARGET_ROOT$TEST_MOUNT_POINT" \
    "$TARGET_ROOT$MEDIA_MOUNT_POINT" \
    "$TARGET_ROOT$SHARED_MOUNT_POINT" \
    "$TARGET_ROOT$ARCHIVE_MOUNT_POINT" \
    "$TARGET_ROOT$CARWASH_BACKUP_ROOT" \
    "$TARGET_ROOT$CARWASH_MOUNT_POINT" \
    "$TARGET_ROOT/boot/efi" \
    "$TARGET_ROOT"; do
    if [[ -n "${mountpoint:-}" ]] && mountpoint -q "$mountpoint" 2>/dev/null; then
      umount -lf "$mountpoint" || true
    fi
  done
}

trap cleanup EXIT

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --target-disk)
        TARGET_DISK="$2"
        shift 2
        ;;
      --backup-dir)
        BACKUP_DIR="$2"
        shift 2
        ;;
      --bootloader-id)
        BOOTLOADER_ID="$2"
        shift 2
        ;;
      --reuse-layout)
        REUSE_LAYOUT=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "Unknown argument: $1" >&2
        usage >&2
        exit 1
        ;;
    esac
  done

  if [[ -z "$TARGET_DISK" ]]; then
    usage >&2
    exit 1
  fi
}

current_root_disk() {
  local root_source
  root_source="$(findmnt -no SOURCE /)"
  printf '/dev/%s' "$(lsblk -no PKNAME "$root_source")"
}

target_parts() {
  lsblk -nrpo NAME,TYPE "$TARGET_DISK" | awk '$2=="part"{print $1}'
}

load_target_parts() {
  local parts
  mapfile -t parts < <(target_parts)
  if [[ ${#parts[@]} -lt 9 ]]; then
    echo "Expected 9 partitions on $TARGET_DISK." >&2
    exit 1
  fi

  BIOS_PART="${parts[0]}"
  EFI_PART="${parts[1]}"
  ROOT_PART="${parts[2]}"
  ARCHIVE_PART="${parts[3]}"
  DATA_PART="${parts[4]}"
  BACKUP_PART="${parts[5]}"
  SHARED_PART="${parts[6]}"
  MEDIA_PART="${parts[7]}"
  TEST_PART="${parts[8]}"
}

save_current_state() {
  mkdir -p "$BACKUP_DIR"
  if command -v sfdisk >/dev/null 2>&1; then
    sfdisk -d "$TARGET_DISK" > "$BACKUP_DIR/sda-before.sfdisk" || true
  fi
  sgdisk --backup="$BACKUP_DIR/sda-before.gpt" "$TARGET_DISK" || true
  lsblk -o NAME,FSTYPE,SIZE,LABEL,MOUNTPOINTS > "$BACKUP_DIR/lsblk-before.txt"
  mount > "$BACKUP_DIR/mount-before.txt"
  cp /etc/fstab "$BACKUP_DIR/fstab-before.txt"
  efibootmgr -v > "$BACKUP_DIR/efibootmgr-before.txt" || true
}

stop_runtime_services() {
  log "Stopping runtime services"
  systemctl stop carwash-health-check.timer carwash-health-check.service || true
  systemctl stop carwash-backup.timer carwash-backup.service || true
  systemctl stop carwash-bot.service || true
  systemctl stop carwash-web.service || true
}

refresh_backup() {
  if ! mountpoint -q "$CARWASH_MOUNT_POINT" 2>/dev/null; then
    if [[ -d "$BACKUP_DIR/carwash-data/app" ]]; then
      log "Current $CARWASH_MOUNT_POINT is not mounted; reusing existing backup in $BACKUP_DIR"
      return 0
    fi

    echo "Current data mount is missing and no reusable backup was found." >&2
    exit 1
  fi

  log "Refreshing migration backup in $BACKUP_DIR"
  mkdir -p "$BACKUP_DIR/archive-keep/VmsArchive-4.1" "$BACKUP_DIR/carwash-data"
  rsync -aH --delete --numeric-ids "$CARWASH_MOUNT_POINT/" "$BACKUP_DIR/carwash-data/"
  if [[ -d /mnt/carwash-host/VmsArchive-4.1 ]]; then
    rsync -aH --delete --numeric-ids /mnt/carwash-host/VmsArchive-4.1/ "$BACKUP_DIR/archive-keep/VmsArchive-4.1/"
  fi
}

unmount_old_sda() {
  log "Unmounting old data mounts from $TARGET_DISK"
  if mountpoint -q "$CARWASH_BACKUP_ROOT" 2>/dev/null; then
    umount -lf "$CARWASH_BACKUP_ROOT" || true
  fi
  if mountpoint -q "$CARWASH_MOUNT_POINT" 2>/dev/null; then
    umount -lf "$CARWASH_MOUNT_POINT"
  fi
  if mountpoint -q /mnt/carwash-host 2>/dev/null; then
    umount -lf /mnt/carwash-host
  fi
}

partition_target_disk() {
  local disk_size_mib required_end_mib
  disk_size_mib=$(( $(blockdev --getsize64 "$TARGET_DISK") / 1024 / 1024 ))
  required_end_mib=$(( EFI_END_MIB + $(gib_to_mib "$ROOT_SIZE_GIB") + $(gib_to_mib "$ARCHIVE_SIZE_GIB") + $(gib_to_mib "$DATA_SIZE_GIB") + $(gib_to_mib "$BACKUP_SIZE_GIB") + $(gib_to_mib "$SHARED_SIZE_GIB") + $(gib_to_mib "$MEDIA_SIZE_GIB") + $(gib_to_mib "$TEST_SIZE_GIB") ))

  if (( required_end_mib >= disk_size_mib )); then
    echo "Target disk is too small for the requested layout." >&2
    exit 1
  fi

  log "Partitioning $TARGET_DISK"
  wipefs -a "$TARGET_DISK"
  sgdisk --zap-all "$TARGET_DISK"
  parted -s "$TARGET_DISK" mklabel gpt
  parted -s "$TARGET_DISK" unit MiB mkpart BIOS 1 3
  parted -s "$TARGET_DISK" set 1 bios_grub on
  parted -s "$TARGET_DISK" unit MiB mkpart EFI fat32 "$EFI_START_MIB" "$EFI_END_MIB"
  parted -s "$TARGET_DISK" set 2 esp on

  local cursor="$EFI_END_MIB"
  local next

  next=$((cursor + $(gib_to_mib "$ROOT_SIZE_GIB")))
  parted -s "$TARGET_DISK" unit MiB mkpart ROOT ext4 "$cursor" "$next"
  parted -s "$TARGET_DISK" name 3 ROOT_OS
  cursor="$next"

  next=$((cursor + $(gib_to_mib "$ARCHIVE_SIZE_GIB")))
  parted -s "$TARGET_DISK" unit MiB mkpart ARCHIVE ntfs "$cursor" "$next"
  parted -s "$TARGET_DISK" name 4 ARCHIVE_KEEP
  cursor="$next"

  next=$((cursor + $(gib_to_mib "$DATA_SIZE_GIB")))
  parted -s "$TARGET_DISK" unit MiB mkpart DATA ext4 "$cursor" "$next"
  parted -s "$TARGET_DISK" name 5 CARWASH_DATA
  cursor="$next"

  next=$((cursor + $(gib_to_mib "$BACKUP_SIZE_GIB")))
  parted -s "$TARGET_DISK" unit MiB mkpart BACKUP ext4 "$cursor" "$next"
  parted -s "$TARGET_DISK" name 6 CARWASH_BACKUP
  cursor="$next"

  next=$((cursor + $(gib_to_mib "$SHARED_SIZE_GIB")))
  parted -s "$TARGET_DISK" unit MiB mkpart SHARED ntfs "$cursor" "$next"
  parted -s "$TARGET_DISK" name 7 SHARED
  cursor="$next"

  next=$((cursor + $(gib_to_mib "$MEDIA_SIZE_GIB")))
  parted -s "$TARGET_DISK" unit MiB mkpart MEDIA ntfs "$cursor" "$next"
  parted -s "$TARGET_DISK" name 8 MEDIA
  cursor="$next"

  next=$((cursor + $(gib_to_mib "$TEST_SIZE_GIB")))
  parted -s "$TARGET_DISK" unit MiB mkpart TEST ext4 "$cursor" "$next"
  parted -s "$TARGET_DISK" name 9 TEST

  partprobe "$TARGET_DISK" || true
  udevadm settle || true
  sleep 2
}

format_target_partitions() {
  load_target_parts

  log "Formatting target partitions"
  mkfs.vfat -F32 "$EFI_PART"
  mkfs.ext4 -F -L CARWASH_ROOT "$ROOT_PART"
  mkfs.ntfs -F -L ARCHIVE_KEEP "$ARCHIVE_PART"
  mkfs.ext4 -F -L CARWASH_DATA "$DATA_PART"
  mkfs.ext4 -F -L CARWASH_BACKUP "$BACKUP_PART"
  mkfs.ntfs -F -L SHARED "$SHARED_PART"
  mkfs.ntfs -F -L MEDIA "$MEDIA_PART"
  mkfs.ext4 -F -L TEST "$TEST_PART"
}

prepare_target_mounts() {
  TARGET_ROOT="$(mktemp -d /mnt/carwash-target-root.XXXXXX)"
  log "Mounting target root at $TARGET_ROOT"
  mount "$ROOT_PART" "$TARGET_ROOT"
  mkdir -p "$TARGET_ROOT/boot/efi"
  mount "$EFI_PART" "$TARGET_ROOT/boot/efi"
}

copy_root_filesystem() {
  log "Copying live root filesystem to $ROOT_PART"
  rsync -aHAX --numeric-ids --delete \
    --exclude=/dev/* \
    --exclude=/proc/* \
    --exclude=/sys/* \
    --exclude=/run/* \
    --exclude=/tmp/* \
    --exclude=/mnt/* \
    --exclude=/media/* \
    --exclude=/lost+found \
    --exclude="$CARWASH_MOUNT_POINT/*" \
    --exclude=/boot/efi/* \
    --exclude=/home/*/.cache/ \
    --exclude=/var/tmp/carwash-sda-migration-* \
    --exclude=/var/tmp/carwash-target-root.* \
    / "$TARGET_ROOT/"
}

mount_target_data_tree() {
  mkdir -p \
    "$TARGET_ROOT$CARWASH_MOUNT_POINT" \
    "$TARGET_ROOT$ARCHIVE_MOUNT_POINT" \
    "$TARGET_ROOT$SHARED_MOUNT_POINT" \
    "$TARGET_ROOT$MEDIA_MOUNT_POINT" \
    "$TARGET_ROOT$TEST_MOUNT_POINT"

  mount "$DATA_PART" "$TARGET_ROOT$CARWASH_MOUNT_POINT"
  mkdir -p "$TARGET_ROOT$CARWASH_BACKUP_ROOT"
  mount "$BACKUP_PART" "$TARGET_ROOT$CARWASH_BACKUP_ROOT"
  mount -t ntfs3 "$ARCHIVE_PART" "$TARGET_ROOT$ARCHIVE_MOUNT_POINT"
  mount -t ntfs3 "$SHARED_PART" "$TARGET_ROOT$SHARED_MOUNT_POINT"
  mount -t ntfs3 "$MEDIA_PART" "$TARGET_ROOT$MEDIA_MOUNT_POINT"
  mount "$TEST_PART" "$TARGET_ROOT$TEST_MOUNT_POINT"
}

restore_data() {
  log "Restoring carwash data to $DATA_PART"
  rsync -aH --delete --numeric-ids --exclude=backups/ "$BACKUP_DIR/carwash-data/" "$TARGET_ROOT$CARWASH_MOUNT_POINT/"
  if [[ -d "$BACKUP_DIR/carwash-data/backups" ]]; then
    rsync -aH --delete --numeric-ids "$BACKUP_DIR/carwash-data/backups/" "$TARGET_ROOT$CARWASH_BACKUP_ROOT/"
  fi
  if [[ -d "$BACKUP_DIR/archive-keep/VmsArchive-4.1" ]]; then
    rsync -aH --delete "$BACKUP_DIR/archive-keep/VmsArchive-4.1/" "$TARGET_ROOT$ARCHIVE_MOUNT_POINT/VmsArchive-4.1/"
  fi

  chown -R "$CARWASH_USER:$CARWASH_USER" "$TARGET_ROOT$CARWASH_MOUNT_POINT" "$TARGET_ROOT$TEST_MOUNT_POINT"
}

write_target_fstab() {
  local root_uuid efi_uuid data_uuid backup_uuid archive_uuid shared_uuid media_uuid test_uuid
  root_uuid="$(normalize_uuid "$ROOT_PART")"
  efi_uuid="$(normalize_uuid "$EFI_PART")"
  data_uuid="$(normalize_uuid "$DATA_PART")"
  backup_uuid="$(normalize_uuid "$BACKUP_PART")"
  archive_uuid="$(normalize_uuid "$ARCHIVE_PART")"
  shared_uuid="$(normalize_uuid "$SHARED_PART")"
  media_uuid="$(normalize_uuid "$MEDIA_PART")"
  test_uuid="$(normalize_uuid "$TEST_PART")"

  cat > "$TARGET_ROOT/etc/fstab" <<EOF
UUID=$root_uuid / ext4 defaults,noatime 0 1
UUID=$efi_uuid /boot/efi vfat umask=0077 0 1
UUID=$data_uuid $CARWASH_MOUNT_POINT ext4 defaults,noatime 0 2
UUID=$backup_uuid $CARWASH_BACKUP_ROOT ext4 defaults,noatime,nodev,nosuid,noexec 0 2
UUID=$archive_uuid $ARCHIVE_MOUNT_POINT ntfs3 ro,uid=$CARWASH_UID,gid=$CARWASH_GID,windows_names,iocharset=utf8,nofail 0 0
UUID=$shared_uuid $SHARED_MOUNT_POINT ntfs3 uid=$CARWASH_UID,gid=$CARWASH_GID,windows_names,iocharset=utf8,noexec,nofail 0 0
UUID=$media_uuid $MEDIA_MOUNT_POINT ntfs3 uid=$CARWASH_UID,gid=$CARWASH_GID,windows_names,iocharset=utf8,noexec,nofail 0 0
UUID=$test_uuid $TEST_MOUNT_POINT ext4 defaults,noatime,nodev,nosuid 0 2
EOF
}

bind_for_chroot() {
  mkdir -p "$TARGET_ROOT/dev" "$TARGET_ROOT/dev/pts" "$TARGET_ROOT/proc" "$TARGET_ROOT/sys" "$TARGET_ROOT/run"
  mount --bind /dev "$TARGET_ROOT/dev"
  mount --bind /dev/pts "$TARGET_ROOT/dev/pts"
  mount --bind /proc "$TARGET_ROOT/proc"
  mount --bind /sys "$TARGET_ROOT/sys"
  mount --bind /run "$TARGET_ROOT/run"
  if [[ -d /sys/firmware/efi/efivars ]]; then
    mkdir -p "$TARGET_ROOT/sys/firmware/efi/efivars"
    mount --bind /sys/firmware/efi/efivars "$TARGET_ROOT/sys/firmware/efi/efivars"
  fi
}

install_bootloader() {
  log "Installing GRUB to $TARGET_DISK"
  chroot "$TARGET_ROOT" /bin/bash -lc "update-initramfs -u -k all"
  chroot "$TARGET_ROOT" /bin/bash -lc "grub-install --target=x86_64-efi --efi-directory=/boot/efi --bootloader-id='$BOOTLOADER_ID' --removable"
  chroot "$TARGET_ROOT" /bin/bash -lc "grub-install --target=i386-pc '$TARGET_DISK'"
  chroot "$TARGET_ROOT" /bin/bash -lc "update-grub"
}

register_boot_entry() {
  local loader_path bootnum current_order new_order

  if [[ -f "$TARGET_ROOT/boot/efi/EFI/$BOOTLOADER_ID/shimx64.efi" ]]; then
    loader_path="\\EFI\\$BOOTLOADER_ID\\shimx64.efi"
  elif [[ -f "$TARGET_ROOT/boot/efi/EFI/$BOOTLOADER_ID/grubx64.efi" ]]; then
    loader_path="\\EFI\\$BOOTLOADER_ID\\grubx64.efi"
  elif [[ -f "$TARGET_ROOT/boot/efi/EFI/BOOT/BOOTX64.EFI" ]]; then
    loader_path="\\EFI\\BOOT\\BOOTX64.EFI"
  else
    log "Skipping efibootmgr registration because no EFI loader was found for $BOOTLOADER_ID"
    return 0
  fi

  efibootmgr -c -d "$TARGET_DISK" -p 2 -L "$BOOTLOADER_ID" -l "$loader_path" >/dev/null
  bootnum="$(efibootmgr | awk -v label="$BOOTLOADER_ID" '$0 ~ label {sub(/^Boot/, "", $1); sub(/\*.*/, "", $1); print $1; exit}')"
  if [[ -n "$bootnum" ]]; then
    current_order="$(efibootmgr | awk -F': ' '/^BootOrder:/ {print $2; exit}')"
    new_order="$bootnum"
    if [[ -n "$current_order" ]]; then
      while IFS= read -r entry; do
        [[ -n "$entry" ]] || continue
        [[ "$entry" == "$bootnum" ]] && continue
        new_order="$new_order,$entry"
      done < <(printf '%s' "$current_order" | tr ',' '\n')
    fi
    efibootmgr -o "$new_order" >/dev/null || true
  fi
}

mount_new_live_data() {
  log "Mounting new data layout for the current live USB session"
  mkdir -p "$CARWASH_MOUNT_POINT" "$CARWASH_BACKUP_ROOT" "$ARCHIVE_MOUNT_POINT" "$SHARED_MOUNT_POINT" "$MEDIA_MOUNT_POINT" "$TEST_MOUNT_POINT"
  if ! mountpoint -q "$CARWASH_MOUNT_POINT" 2>/dev/null; then
    mount "$DATA_PART" "$CARWASH_MOUNT_POINT"
  fi
  if ! mountpoint -q "$CARWASH_BACKUP_ROOT" 2>/dev/null; then
    mount "$BACKUP_PART" "$CARWASH_BACKUP_ROOT"
  fi
  if ! mountpoint -q "$ARCHIVE_MOUNT_POINT" 2>/dev/null; then
    mount -t ntfs3 -o "ro,uid=$CARWASH_UID,gid=$CARWASH_GID,windows_names,iocharset=utf8" "$ARCHIVE_PART" "$ARCHIVE_MOUNT_POINT" || true
  fi
  if ! mountpoint -q "$SHARED_MOUNT_POINT" 2>/dev/null; then
    mount -t ntfs3 -o "uid=$CARWASH_UID,gid=$CARWASH_GID,windows_names,iocharset=utf8,noexec" "$SHARED_PART" "$SHARED_MOUNT_POINT" || true
  fi
  if ! mountpoint -q "$MEDIA_MOUNT_POINT" 2>/dev/null; then
    mount -t ntfs3 -o "uid=$CARWASH_UID,gid=$CARWASH_GID,windows_names,iocharset=utf8,noexec" "$MEDIA_PART" "$MEDIA_MOUNT_POINT" || true
  fi
  if ! mountpoint -q "$TEST_MOUNT_POINT" 2>/dev/null; then
    mount "$TEST_PART" "$TEST_MOUNT_POINT" || true
  fi
}

start_runtime_services() {
  log "Starting runtime services again"
  systemctl start carwash-web.service
  systemctl start carwash-bot.service
  systemctl start carwash-backup.timer || true
  systemctl start carwash-health-check.timer || true
}

main() {
  parse_args "$@"
  require_root

  for cmd in rsync parted sgdisk mkfs.vfat mkfs.ext4 mkfs.ntfs grub-install update-grub efibootmgr findmnt lsblk blkid; do
    require_cmd "$cmd"
  done

  if [[ ! -b "$TARGET_DISK" ]]; then
    echo "Target disk is not a block device: $TARGET_DISK" >&2
    exit 1
  fi

  if [[ "$(current_root_disk)" == "$TARGET_DISK" ]]; then
    echo "Refusing to repartition the current root disk." >&2
    exit 1
  fi

  if [[ -z "$BACKUP_DIR" ]]; then
    BACKUP_DIR="/var/tmp/carwash-sda-migration-$(date +%Y%m%d-%H%M%S)"
  fi

  CARWASH_UID="$(id -u "$CARWASH_USER")"
  CARWASH_GID="$(id -g "$CARWASH_USER")"

  save_current_state
  stop_runtime_services
  refresh_backup
  unmount_old_sda
  if (( REUSE_LAYOUT == 1 )); then
    log "Reusing existing partition layout on $TARGET_DISK"
    load_target_parts
  else
    partition_target_disk
    format_target_partitions
  fi
  prepare_target_mounts
  copy_root_filesystem
  mount_target_data_tree
  restore_data
  write_target_fstab
  bind_for_chroot
  install_bootloader
  register_boot_entry
  mount_new_live_data
  start_runtime_services

  log "Migration completed. Internal disk is prepared for boot."
  log "Backup directory: $BACKUP_DIR"
}

main "$@"

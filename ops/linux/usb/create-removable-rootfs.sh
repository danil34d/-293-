#!/usr/bin/env bash

set -euo pipefail

DEVICE=""
SEED_ARCHIVE=""
AUTHORIZED_KEYS_FILE=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --device)
      DEVICE="$2"
      shift 2
      ;;
    --seed-archive)
      SEED_ARCHIVE="$2"
      shift 2
      ;;
    --authorized-keys-file)
      AUTHORIZED_KEYS_FILE="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$DEVICE" || -z "$SEED_ARCHIVE" ]]; then
  echo "Usage: $0 --device /dev/sdX --seed-archive /path/to/carwash-usb-seed.tar.gz [--authorized-keys-file file]" >&2
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

apt-get update
apt-get install -y debootstrap gdisk parted dosfstools e2fsprogs grub-efi-amd64-bin grub-efi-amd64-signed grub-pc-bin shim-signed rsync curl ca-certificates

refresh_partition_view() {
  local device="$1"

  partprobe "$device" || true
  udevadm settle || true
  sleep 2

  if [[ "$device" == /dev/loop* ]]; then
    local part_count backing_file refreshed_device
    part_count="$(lsblk -nrpo NAME,TYPE "$device" 2>/dev/null | awk '$2=="part"{count++} END{print count+0}')"
    if (( part_count < 3 )); then
      backing_file="$(losetup -l -n -O NAME,BACK-FILE | awk -v dev="$device" '$1==dev {print $2; exit}')"
      if [[ -n "$backing_file" ]]; then
        losetup -d "$device"
        refreshed_device="$(losetup --find --show --partscan "$backing_file")"
        partprobe "$refreshed_device" || true
        udevadm settle || true
        sleep 2
        printf '%s' "$refreshed_device"
        return 0
      fi
    fi
  fi

  printf '%s' "$device"
}

run_parted() {
  if parted "$@"; then
    return 0
  fi

  if [[ "$DEVICE" == /dev/loop* ]]; then
    return 0
  fi

  return 1
}

for mountpoint in $(lsblk -nrpo MOUNTPOINT "$DEVICE" | awk 'NF'); do
  umount -lf "$mountpoint" || true
done

wipefs -a "$DEVICE"
sgdisk --zap-all "$DEVICE"
run_parted -s "$DEVICE" mklabel gpt
run_parted -s "$DEVICE" unit MiB mkpart BIOS 1 3
run_parted -s "$DEVICE" set 1 bios_grub on
run_parted -s "$DEVICE" unit MiB mkpart EFI fat32 3 515
run_parted -s "$DEVICE" set 2 esp on
run_parted -s "$DEVICE" unit MiB mkpart ROOT ext4 515 100%

partprobe "$DEVICE" || true
udevadm settle || true
sleep 2
DEVICE="$(refresh_partition_view "$DEVICE")"

mapfile -t PARTS < <(lsblk -nrpo NAME,TYPE "$DEVICE" | awk '$2=="part"{print $1}')
if [[ ${#PARTS[@]} -lt 3 ]]; then
  echo "Expected 3 partitions on $DEVICE after partitioning." >&2
  exit 1
fi

EFI_PART="${PARTS[1]}"
ROOT_PART="${PARTS[2]}"

mkfs.vfat -F32 "$EFI_PART"
mkfs.ext4 -F -L CARWASH_USB_ROOT "$ROOT_PART"

TARGET_ROOT="$(mktemp -d)"
cleanup() {
  for mp in "$TARGET_ROOT/dev/pts" "$TARGET_ROOT/dev" "$TARGET_ROOT/proc" "$TARGET_ROOT/sys" "$TARGET_ROOT/run" "$TARGET_ROOT/boot/efi" "$TARGET_ROOT"; do
    if mountpoint -q "$mp" 2>/dev/null; then
      umount -lf "$mp" || true
    fi
  done
  rm -rf "$TARGET_ROOT"
}
trap cleanup EXIT

mount "$ROOT_PART" "$TARGET_ROOT"
mkdir -p "$TARGET_ROOT/boot/efi"
mount "$EFI_PART" "$TARGET_ROOT/boot/efi"

debootstrap --components=main,universe noble "$TARGET_ROOT" http://archive.ubuntu.com/ubuntu

cat > "$TARGET_ROOT/etc/apt/sources.list" <<'EOF'
deb http://archive.ubuntu.com/ubuntu noble main universe
deb http://archive.ubuntu.com/ubuntu noble-updates main universe
deb http://archive.ubuntu.com/ubuntu noble-backports main universe
deb http://security.ubuntu.com/ubuntu noble-security main universe
EOF

ROOT_UUID="$(blkid -s UUID -o value "$ROOT_PART")"
EFI_UUID="$(blkid -s UUID -o value "$EFI_PART")"
cat > "$TARGET_ROOT/etc/fstab" <<EOF
UUID=$ROOT_UUID / ext4 defaults,noatime 0 1
UUID=$EFI_UUID /boot/efi vfat umask=0077 0 1
EOF

cp /etc/resolv.conf "$TARGET_ROOT/etc/resolv.conf"
mkdir -p "$TARGET_ROOT/opt/carwash-seed"
install -m 0644 "$SEED_ARCHIVE" "$TARGET_ROOT/opt/carwash-seed/carwash-usb-seed.tar.gz"
rsync -a "$SCRIPT_DIR/" "$TARGET_ROOT/opt/carwash-seed/usb/"

if [[ -n "$AUTHORIZED_KEYS_FILE" && -f "$AUTHORIZED_KEYS_FILE" ]]; then
  install -D -m 0600 "$AUTHORIZED_KEYS_FILE" "$TARGET_ROOT/opt/carwash-seed/authorized_keys"
fi

mount --bind /dev "$TARGET_ROOT/dev"
mount --bind /dev/pts "$TARGET_ROOT/dev/pts"
mount --bind /proc "$TARGET_ROOT/proc"
mount --bind /sys "$TARGET_ROOT/sys"
mount --bind /run "$TARGET_ROOT/run"

cat > "$TARGET_ROOT/usr/sbin/policy-rc.d" <<'EOF'
#!/bin/sh
exit 101
EOF
chmod 0755 "$TARGET_ROOT/usr/sbin/policy-rc.d"

chroot "$TARGET_ROOT" /bin/bash -lc "/opt/carwash-seed/usb/install-usb-platform.sh --seed-archive /opt/carwash-seed/carwash-usb-seed.tar.gz"

if [[ -f "$TARGET_ROOT/opt/carwash-seed/authorized_keys" ]]; then
  chroot "$TARGET_ROOT" /bin/bash -lc "install -d -m 0700 /home/carwash/.ssh && cat /opt/carwash-seed/authorized_keys >> /home/carwash/.ssh/authorized_keys && chown -R carwash:carwash /home/carwash/.ssh && chmod 0600 /home/carwash/.ssh/authorized_keys"
fi

rm -f "$TARGET_ROOT/usr/sbin/policy-rc.d"

chroot "$TARGET_ROOT" /bin/bash -lc "grub-install --target=x86_64-efi --efi-directory=/boot/efi --bootloader-id=CarwashUSB --removable --no-nvram"
chroot "$TARGET_ROOT" /bin/bash -lc "grub-install --target=i386-pc '$DEVICE'"
chroot "$TARGET_ROOT" /bin/bash -lc "update-grub"

echo "USB rootfs created successfully on $DEVICE"

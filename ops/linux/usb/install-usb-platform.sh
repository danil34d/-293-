#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEED_ARCHIVE=""
CARWASH_USER="${CARWASH_USER:-carwash}"
HOSTNAME_VALUE="${HOSTNAME_VALUE:-carwash-usb}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --seed-archive)
      SEED_ARCHIVE="$2"
      shift 2
      ;;
    --username)
      CARWASH_USER="$2"
      shift 2
      ;;
    --hostname)
      HOSTNAME_VALUE="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y \
  sudo \
  curl \
  git \
  rsync \
  ca-certificates \
  ufw \
  systemd-sysv \
  initramfs-tools \
  network-manager \
  openssh-server \
  build-essential \
  python3 \
  python3-venv \
  sqlite3 \
  xz-utils \
  libgl1 \
  libglib2.0-0 \
  libgomp1 \
  xorg \
  xfce4 \
  xfce4-terminal \
  lightdm \
  zram-tools \
  linux-firmware \
  wpasupplicant \
  parted \
  gdisk \
  dosfstools \
  e2fsprogs \
  locales \
  tzdata \
  linux-image-generic \
  grub2-common \
  grub-pc-bin \
  grub-efi-amd64-bin \
  grub-efi-amd64-signed \
  shim-signed

ln -snf /usr/share/zoneinfo/Europe/Moscow /etc/localtime
echo "Europe/Moscow" > /etc/timezone
dpkg-reconfigure -f noninteractive tzdata

grep -q '^ru_RU.UTF-8 UTF-8$' /etc/locale.gen || echo 'ru_RU.UTF-8 UTF-8' >> /etc/locale.gen
grep -q '^en_US.UTF-8 UTF-8$' /etc/locale.gen || echo 'en_US.UTF-8 UTF-8' >> /etc/locale.gen
locale-gen
update-locale LANG=ru_RU.UTF-8

cat > /etc/netplan/01-network-manager-all.yaml <<'EOF'
network:
  version: 2
  renderer: NetworkManager
EOF

echo "$HOSTNAME_VALUE" > /etc/hostname
cat > /etc/hosts <<EOF
127.0.0.1 localhost
127.0.1.1 $HOSTNAME_VALUE
EOF

if ! id -u "$CARWASH_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash -G sudo "$CARWASH_USER"
fi
echo "$CARWASH_USER:carwash" | chpasswd

install -d -m 0755 /opt/carwash-seed /etc/lightdm/lightdm.conf.d /etc/xdg/autostart "/home/$CARWASH_USER/Desktop"
if [[ "$(readlink -f "$SCRIPT_DIR")" != "/opt/carwash-seed/usb" ]]; then
  rsync -a "$SCRIPT_DIR/" /opt/carwash-seed/usb/
fi

if [[ -n "$SEED_ARCHIVE" ]]; then
  if [[ "$(readlink -f "$SEED_ARCHIVE")" != "/opt/carwash-seed/carwash-usb-seed.tar.gz" ]]; then
    install -m 0644 "$SEED_ARCHIVE" /opt/carwash-seed/carwash-usb-seed.tar.gz
  fi
fi

if ! command -v firefox >/dev/null 2>&1; then
  rm -rf /opt/firefox
  curl -fsSL "https://download.mozilla.org/?product=firefox-latest-ssl&os=linux64&lang=ru" -o /tmp/firefox.tar.xz
  tar -xJf /tmp/firefox.tar.xz -C /opt
  ln -sfn /opt/firefox/firefox /usr/local/bin/firefox
fi

cat > /etc/lightdm/lightdm.conf.d/60-carwash-autologin.conf <<EOF
[Seat:*]
autologin-user=$CARWASH_USER
autologin-user-timeout=0
user-session=xfce
EOF

cat > /etc/xdg/autostart/carwash-browser.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=Carwash Browser Bootstrap
Exec=/usr/local/bin/carwash-session-bootstrap.sh
X-GNOME-Autostart-enabled=true
EOF

cat > "/home/$CARWASH_USER/Desktop/Carwash.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=Carwash
Exec=firefox http://127.0.0.1:3000/login
Terminal=false
EOF

cat > "/home/$CARWASH_USER/Desktop/Logs.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=Logs
Exec=/usr/local/bin/carwash-open-logs.sh
Terminal=false
EOF

cat > "/home/$CARWASH_USER/Desktop/Terminal.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=Terminal
Exec=xfce4-terminal
Terminal=false
EOF

cat > "/home/$CARWASH_USER/Desktop/Project.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=Project
Exec=/usr/local/bin/carwash-open-project.sh
Terminal=false
EOF

chmod 0755 "/home/$CARWASH_USER/Desktop/"*.desktop
chown -R "$CARWASH_USER:$CARWASH_USER" "/home/$CARWASH_USER"

CARWASH_USER="$CARWASH_USER" /opt/carwash-seed/usb/install-runtime-services.sh

systemctl enable NetworkManager ssh lightdm || true

#!/usr/bin/env bash

set -euo pipefail

if [[ -f /etc/default/carwash ]]; then
  set -a
  # shellcheck disable=SC1091
  source /etc/default/carwash
  set +a
fi

CARWASH_USER="${CARWASH_USER:-carwash}"
CARWASH_HOME="$(getent passwd "$CARWASH_USER" | cut -d: -f6)"
DESKTOP_DIR="$CARWASH_HOME/Desktop"
APPLICATIONS_DIR="$CARWASH_HOME/.local/share/applications"
LAUNCHER_BIN="/usr/local/bin/carwash-firefox-webapp-launch.sh"
STOPPER_BIN="/usr/local/bin/carwash-session-stop.sh"

WALLBOARD_URL="${CARWASH_WALLBOARD_URL:-http://127.0.0.1:3000/wallboard}"
ADMIN_URL="${CARWASH_ADMIN_URL:-http://127.0.0.1:3000/login}"
WALLBOARD_PROFILE="${CARWASH_WALLBOARD_FIREFOX_PROFILE:-$CARWASH_HOME/.mozilla/firefox/carwash-wallboard-profile}"
ADMIN_PROFILE="${CARWASH_ADMIN_FIREFOX_PROFILE:-$CARWASH_HOME/.mozilla/firefox/carwash-admin-profile}"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

install -d -m 0755 -o "$CARWASH_USER" -g "$CARWASH_USER" "$DESKTOP_DIR" "$APPLICATIONS_DIR"

write_desktop_file() {
  local path="$1"
  local name="$2"
  local exec_line="$3"
  local icon_name="$4"
  local comment="$5"

  cat > "$path" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=$name
Comment=$comment
Exec=$exec_line
Icon=$icon_name
Terminal=false
Categories=Utility;
StartupNotify=true
EOF

  chmod 0755 "$path"
  chown "$CARWASH_USER:$CARWASH_USER" "$path"
}

write_desktop_file \
  "$DESKTOP_DIR/carwash-wallboard.desktop" \
  "Монитор автомойки" \
  "$LAUNCHER_BIN $WALLBOARD_PROFILE $WALLBOARD_URL" \
  "utilities-system-monitor" \
  "Открыть монитор системы и автомойки"

write_desktop_file \
  "$DESKTOP_DIR/carwash-admin.desktop" \
  "Админ автомойки" \
  "$LAUNCHER_BIN $ADMIN_PROFILE $ADMIN_URL" \
  "system-users" \
  "Открыть админку автомойки"

write_desktop_file \
  "$DESKTOP_DIR/carwash-wallboard-close.desktop" \
  "Закрыть монитор автомойки" \
  "$STOPPER_BIN $WALLBOARD_PROFILE" \
  "window-close" \
  "Закрыть монитор автомойки"

install -m 0755 "$DESKTOP_DIR/carwash-wallboard.desktop" "$APPLICATIONS_DIR/carwash-wallboard.desktop"
install -m 0755 "$DESKTOP_DIR/carwash-admin.desktop" "$APPLICATIONS_DIR/carwash-admin.desktop"
install -m 0755 "$DESKTOP_DIR/carwash-wallboard-close.desktop" "$APPLICATIONS_DIR/carwash-wallboard-close.desktop"
chown "$CARWASH_USER:$CARWASH_USER" \
  "$APPLICATIONS_DIR/carwash-wallboard.desktop" \
  "$APPLICATIONS_DIR/carwash-admin.desktop" \
  "$APPLICATIONS_DIR/carwash-wallboard-close.desktop"

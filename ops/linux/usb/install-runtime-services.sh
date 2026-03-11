#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYSTEMD_DIR="$SCRIPT_DIR/systemd"
TEMPLATE_ENV="$SCRIPT_DIR/templates/carwash.env.tpl"

CARWASH_USER="${CARWASH_USER:-carwash}"
CARWASH_MOUNT_POINT="${CARWASH_MOUNT_POINT:-/srv/carwash}"
CARWASH_APP_ROOT="${CARWASH_APP_ROOT:-/srv/carwash/app}"
CARWASH_NODE_HOME="${CARWASH_NODE_HOME:-/srv/carwash/opt/node}"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

render_file() {
  local src="$1"
  local dst="$2"

  sed \
    -e "s|__CARWASH_USER__|$CARWASH_USER|g" \
    -e "s|__CARWASH_MOUNT_POINT__|$CARWASH_MOUNT_POINT|g" \
    -e "s|__CARWASH_APP_ROOT__|$CARWASH_APP_ROOT|g" \
    -e "s|__CARWASH_NODE_HOME__|$CARWASH_NODE_HOME|g" \
    -e "s|__CARWASH_NODE_BIN_DIR__|$CARWASH_NODE_HOME/bin|g" \
    "$src" > "$dst"
}

install -d -m 0755 /usr/local/bin /etc/systemd/system /etc/default
install -d -m 0775 -o "$CARWASH_USER" -g "$CARWASH_USER" /var/lib/carwash
install -m 0755 "$SCRIPT_DIR/storage-ensure.sh" /usr/local/bin/carwash-storage-ensure.sh
install -m 0755 "$SCRIPT_DIR/provision-firstboot.sh" /usr/local/bin/carwash-firstboot-provision.sh
install -m 0755 "$SCRIPT_DIR/session-bootstrap.sh" /usr/local/bin/carwash-session-bootstrap.sh
install -m 0755 "$SCRIPT_DIR/session-stop.sh" /usr/local/bin/carwash-session-stop.sh
install -m 0755 "$SCRIPT_DIR/firefox-webapp-launch.sh" /usr/local/bin/carwash-firefox-webapp-launch.sh
install -m 0755 "$SCRIPT_DIR/install-desktop-apps.sh" /usr/local/bin/carwash-install-desktop-apps.sh
install -m 0755 "$SCRIPT_DIR/configure-firewall.sh" /usr/local/bin/carwash-configure-firewall.sh
install -m 0755 "$SCRIPT_DIR/backup-create.sh" /usr/local/bin/carwash-backup-create.sh
install -m 0755 "$SCRIPT_DIR/health-check.sh" /usr/local/bin/carwash-health-check.sh
install -m 0755 "$SCRIPT_DIR/pin-current-ip.sh" /usr/local/bin/carwash-pin-current-ip.sh

cat > /usr/local/bin/carwash-open-logs.sh <<'EOF'
#!/usr/bin/env bash
exec xfce4-terminal --title="Carwash Logs" --command "/bin/bash -lc 'journalctl -u carwash-storage-check.service -u carwash-provision.service -u carwash-web.service -u carwash-bot.service -f; exec bash'"
EOF
chmod 0755 /usr/local/bin/carwash-open-logs.sh

cat > /usr/local/bin/carwash-open-project.sh <<'EOF'
#!/usr/bin/env bash
exec xfce4-terminal --working-directory=/srv/carwash/app
EOF
chmod 0755 /usr/local/bin/carwash-open-project.sh

render_file "$TEMPLATE_ENV" /etc/default/carwash
render_file "$SYSTEMD_DIR/carwash-storage-check.service.tpl" /etc/systemd/system/carwash-storage-check.service
render_file "$SYSTEMD_DIR/carwash-provision.service.tpl" /etc/systemd/system/carwash-provision.service
render_file "$SYSTEMD_DIR/carwash-web.service.tpl" /etc/systemd/system/carwash-web.service
render_file "$SYSTEMD_DIR/carwash-bot.service.tpl" /etc/systemd/system/carwash-bot.service
render_file "$SYSTEMD_DIR/carwash-firewall.service.tpl" /etc/systemd/system/carwash-firewall.service
render_file "$SYSTEMD_DIR/carwash-backup.service.tpl" /etc/systemd/system/carwash-backup.service
render_file "$SYSTEMD_DIR/carwash-backup.timer.tpl" /etc/systemd/system/carwash-backup.timer
render_file "$SYSTEMD_DIR/carwash-health-check.service.tpl" /etc/systemd/system/carwash-health-check.service
render_file "$SYSTEMD_DIR/carwash-health-check.timer.tpl" /etc/systemd/system/carwash-health-check.timer

systemctl daemon-reload || true
systemctl enable NetworkManager ssh carwash-storage-check.service carwash-provision.service carwash-web.service carwash-bot.service carwash-firewall.service carwash-backup.timer carwash-health-check.timer || true
/usr/local/bin/carwash-install-desktop-apps.sh

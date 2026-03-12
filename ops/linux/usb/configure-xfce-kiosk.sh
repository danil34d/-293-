#!/usr/bin/env bash

set -euo pipefail

if [[ -f /etc/default/carwash ]]; then
  # shellcheck disable=SC1091
  source /etc/default/carwash
fi

CARWASH_USER="${CARWASH_USER:-carwash}"
CARWASH_HOME="$(getent passwd "$CARWASH_USER" | cut -d: -f6)"

AUTOSTART_DIR="/etc/xdg/autostart"
KIOSK_DIR="/etc/xdg/xfce4/kiosk"
XFCONF_DIR="/etc/xdg/xfce4/xfconf/xfce-perchannel-xml"
SESSION_XML="$XFCONF_DIR/xfce4-session.xml"
KIOSKRC_PATH="$KIOSK_DIR/kioskrc"
USER_SESSION_XML="$CARWASH_HOME/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-session.xml"
SESSION_CACHE_DIR="$CARWASH_HOME/.cache/sessions"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

install -d -m 0755 "$AUTOSTART_DIR" "$KIOSK_DIR" "$XFCONF_DIR"
install -d -m 0755 -o "$CARWASH_USER" -g "$CARWASH_USER" \
  "$CARWASH_HOME/.config/xfce4/xfconf/xfce-perchannel-xml" \
  "$CARWASH_HOME/.cache"

cat > "$AUTOSTART_DIR/carwash-xfce-kiosk.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=Carwash Xfce Kiosk Apply
Exec=/usr/local/bin/carwash-xfce-kiosk-apply.sh
OnlyShowIn=XFCE;
X-GNOME-Autostart-enabled=true
Terminal=false
EOF

cat > "$AUTOSTART_DIR/carwash-browser.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=Carwash Browser Bootstrap
Exec=/usr/local/bin/carwash-session-bootstrap.sh
OnlyShowIn=XFCE;
X-GNOME-Autostart-enabled=true
Terminal=false
EOF

cat > "$KIOSKRC_PATH" <<'EOF'
[xfce4-session]
CustomizeSplash=NONE
CustomizeChooser=NONE
CustomizeLogout=NONE
CustomizeCompatibility=NONE
CustomizeSecurity=NONE

[xfce4-panel]
CustomizePanel=NONE

[xfdesktop]
UserMenu=NONE
CustomizeBackdrop=NONE
CustomizeDesktopMenu=NONE
CustomizeWindowlist=NONE
CustomizeDesktopIcons=NONE
EOF

# Keep the packaged failsafe session definition intact. Without it Xfce can
# start xfce4-session but fail to launch xfwm4/xfdesktop/xfce4-panel.
cat > "$SESSION_XML" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<channel name="xfce4-session" version="1.0">
  <property name="general" type="empty">
    <property name="FailsafeSessionName" type="string" value="Failsafe"/>
    <property name="LockCommand" type="string" value=""/>
  </property>
  <property name="sessions" type="empty">
    <property name="Failsafe" type="empty">
      <property name="IsFailsafe" type="bool" value="true"/>
      <property name="Count" type="int" value="5"/>
      <property name="Client0_Command" type="array">
        <value type="string" value="xfwm4"/>
      </property>
      <property name="Client0_Priority" type="int" value="15"/>
      <property name="Client0_PerScreen" type="bool" value="false"/>
      <property name="Client1_Command" type="array">
        <value type="string" value="xfsettingsd"/>
      </property>
      <property name="Client1_Priority" type="int" value="20"/>
      <property name="Client1_PerScreen" type="bool" value="false"/>
      <property name="Client2_Command" type="array">
        <value type="string" value="xfce4-panel"/>
      </property>
      <property name="Client2_Priority" type="int" value="25"/>
      <property name="Client2_PerScreen" type="bool" value="false"/>
      <property name="Client3_Command" type="array">
        <value type="string" value="Thunar"/>
        <value type="string" value="--daemon"/>
      </property>
      <property name="Client3_Priority" type="int" value="30"/>
      <property name="Client3_PerScreen" type="bool" value="false"/>
      <property name="Client4_Command" type="array">
        <value type="string" value="xfdesktop"/>
      </property>
      <property name="Client4_Priority" type="int" value="35"/>
      <property name="Client4_PerScreen" type="bool" value="false"/>
    </property>
  </property>
</channel>
EOF

rm -f "$USER_SESSION_XML"
rm -rf "$SESSION_CACHE_DIR"
install -d -m 0700 -o "$CARWASH_USER" -g "$CARWASH_USER" "$SESSION_CACHE_DIR"

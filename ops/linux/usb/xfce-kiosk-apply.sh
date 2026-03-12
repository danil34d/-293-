#!/usr/bin/env bash

set -euo pipefail

if [[ -f /etc/default/carwash ]]; then
  set -a
  # shellcheck disable=SC1091
  source /etc/default/carwash
  set +a
fi

MODE="${1:-all}"
AUTOHIDE_MODE="${CARWASH_XFCE_PANEL_AUTOHIDE:-intelligently}"
PANEL_SIZE="${CARWASH_XFCE_PANEL_SIZE:-28}"
PANEL_LENGTH="${CARWASH_XFCE_PANEL_LENGTH:-100}"
PANEL_POSITION="${CARWASH_XFCE_PANEL_POSITION:-p=6;x=0;y=0}"
PANEL_ICON_SIZE="${CARWASH_XFCE_PANEL_ICON_SIZE:-20}"
PANEL_CLOCK_FORMAT="${CARWASH_XFCE_PANEL_CLOCK_FORMAT:-%H:%M}"
PANEL_STATUS_COMMAND="${CARWASH_XFCE_PANEL_STATUS_COMMAND:-/usr/local/bin/carwash-panel-status.sh}"
PANEL_DIR="$HOME/.config/xfce4/panel"
APPLICATIONS_DIR="$HOME/.local/share/applications"

xfconf_set() {
  local channel="$1"
  local property="$2"
  local type="$3"
  local value="$4"

  if xfconf-query -c "$channel" -p "$property" >/dev/null 2>&1; then
    xfconf-query -c "$channel" -p "$property" -t "$type" -s "$value" >/dev/null
  else
    xfconf-query -c "$channel" -p "$property" -n -t "$type" -s "$value" >/dev/null
  fi
}

xfconf_reset() {
  local channel="$1"
  local property="$2"
  xfconf-query -c "$channel" -p "$property" -rR >/dev/null 2>&1 || true
}

set_array_property() {
  local channel="$1"
  local property="$2"
  local value_type="$3"
  shift 3
  local args=("$channel" "-p" "$property" "-n" "-a")
  local item

  xfconf_reset "$channel" "$property"

  for item in "$@"; do
    args+=(-t "$value_type" -s "$item")
  done

  xfconf-query -c "${args[0]}" "${args[@]:1}" >/dev/null
}

resolve_panel_autohide() {
  case "${AUTOHIDE_MODE,,}" in
    never|off|0)
      echo 0
      ;;
    always|2)
      echo 2
      ;;
    intelligently|smart|intelligent|1|*)
      echo 1
      ;;
  esac
}

apply_session_policy() {
  command -v xfconf-query >/dev/null 2>&1 || return 0
  mkdir -p "$HOME/.cache/sessions"
  rm -f "$HOME/.cache/sessions"/*
  xfconf_set xfce4-session /general/SaveOnExit bool false
  xfconf_set xfce4-session /general/ShowSave bool false
}

write_launcher_item() {
  local plugin_id="$1"
  local desktop_id="$2"

  install -d -m 0755 "$PANEL_DIR/launcher-${plugin_id}"
  install -m 0644 "$APPLICATIONS_DIR/$desktop_id" "$PANEL_DIR/launcher-${plugin_id}/$desktop_id"
}

apply_panel_policy() {
  command -v xfconf-query >/dev/null 2>&1 || return 0

  local autohide_value
  autohide_value="$(resolve_panel_autohide)"

  local launcher_admin_id="101"
  local launcher_wallboard_id="102"
  local separator_fill_id="103"
  local genmon_id="104"
  local separator_tail_id="105"
  local clock_id="106"
  local plugin_ids=(
    "$launcher_admin_id"
    "$launcher_wallboard_id"
    "$separator_fill_id"
    "$genmon_id"
    "$separator_tail_id"
    "$clock_id"
  )

  install -d -m 0755 "$PANEL_DIR"
  write_launcher_item "$launcher_admin_id" "carwash-admin.desktop"
  write_launcher_item "$launcher_wallboard_id" "carwash-wallboard.desktop"

  set_array_property xfce4-panel /panels int 1
  xfconf_set xfce4-panel /panels/panel-1/position string "$PANEL_POSITION"
  xfconf_set xfce4-panel /panels/panel-1/position-locked bool true
  xfconf_set xfce4-panel /panels/panel-1/length int "$PANEL_LENGTH"
  xfconf_set xfce4-panel /panels/panel-1/size int "$PANEL_SIZE"
  xfconf_set xfce4-panel /panels/panel-1/icon-size int "$PANEL_ICON_SIZE"
  xfconf_set xfce4-panel /panels/panel-1/autohide-behavior int "$autohide_value"
  set_array_property xfce4-panel /panels/panel-1/plugin-ids int "${plugin_ids[@]}"

  xfconf_set xfce4-panel /plugins/plugin-"$launcher_admin_id" string launcher
  set_array_property xfce4-panel /plugins/plugin-"$launcher_admin_id"/items string carwash-admin.desktop

  xfconf_set xfce4-panel /plugins/plugin-"$launcher_wallboard_id" string launcher
  set_array_property xfce4-panel /plugins/plugin-"$launcher_wallboard_id"/items string carwash-wallboard.desktop

  xfconf_set xfce4-panel /plugins/plugin-"$separator_fill_id" string separator
  xfconf_set xfce4-panel /plugins/plugin-"$separator_fill_id"/expand bool true
  xfconf_set xfce4-panel /plugins/plugin-"$separator_fill_id"/style uint 0

  if dpkg-query -W -f='${Status}' xfce4-genmon-plugin 2>/dev/null | grep -q "install ok installed"; then
    xfconf_set xfce4-panel /plugins/plugin-"$genmon_id" string genmon
    xfconf_set xfce4-panel /plugins/plugin-"$genmon_id"/command string "$PANEL_STATUS_COMMAND"
    xfconf_set xfce4-panel /plugins/plugin-"$genmon_id"/cycle-time int 5
  else
    xfconf_set xfce4-panel /plugins/plugin-"$genmon_id" string separator
    xfconf_set xfce4-panel /plugins/plugin-"$genmon_id"/style uint 0
  fi

  xfconf_set xfce4-panel /plugins/plugin-"$separator_tail_id" string separator
  xfconf_set xfce4-panel /plugins/plugin-"$separator_tail_id"/style uint 0

  xfconf_set xfce4-panel /plugins/plugin-"$clock_id" string clock
  xfconf_set xfce4-panel /plugins/plugin-"$clock_id"/digital-format string "$PANEL_CLOCK_FORMAT"

  xfce4-panel -r >/dev/null 2>&1 || true
}

refresh_desktop() {
  xfdesktop --reload >/dev/null 2>&1 || true
  xfdesktop --arrange >/dev/null 2>&1 || true
}

case "$MODE" in
  all)
    apply_session_policy
    apply_panel_policy
    refresh_desktop
    ;;
  desktop-only)
    refresh_desktop
    ;;
  panel-only)
    apply_panel_policy
    ;;
  session-only)
    apply_session_policy
    ;;
  *)
    echo "Unknown mode: $MODE" >&2
    exit 1
    ;;
esac

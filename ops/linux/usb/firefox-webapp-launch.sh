#!/usr/bin/env bash

set -euo pipefail

if [[ -f /etc/default/carwash ]]; then
  set -a
  # shellcheck disable=SC1091
  source /etc/default/carwash
  set +a
fi

PROFILE_PATH="${1:?profile path is required}"
TARGET_URL="${2:?target url is required}"
FIREFOX_BIN="${CARWASH_FIREFOX_BIN:-firefox}"
CURRENT_UID="$(id -u)"

mkdir -p "$PROFILE_PATH/chrome"

cat > "$PROFILE_PATH/user.js" <<EOF
user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);
user_pref("browser.startup.homepage", "$TARGET_URL");
user_pref("browser.startup.page", 1);
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.aboutwelcome.enabled", false);
user_pref("browser.newtabpage.enabled", false);
user_pref("browser.tabs.inTitlebar", 0);
user_pref("browser.toolbars.bookmarks.visibility", "never");
user_pref("browser.sessionstore.resume_from_crash", false);
user_pref("browser.sessionstore.max_tabs_undo", 0);
user_pref("browser.sessionstore.max_windows_undo", 0);
user_pref("browser.warnOnQuitShortcut", false);
user_pref("datareporting.policy.dataSubmissionEnabled", false);
user_pref("toolkit.telemetry.enabled", false);
EOF

cat > "$PROFILE_PATH/chrome/userChrome.css" <<'EOF'
#TabsToolbar,
#nav-bar,
#PersonalToolbar,
#sidebar-box,
#sidebar-splitter,
#tracking-protection-icon-container,
#star-button-box,
#alltabs-button,
#page-action-buttons {
  display: none !important;
}

#navigator-toolbox {
  border: 0 !important;
  min-height: 0 !important;
}

#titlebar {
  appearance: auto !important;
}
EOF

# Kill only Firefox processes using this profile. Matching the raw profile path
# can kill this launcher itself because the path is present in the shell args.
pkill -9 -u "$CURRENT_UID" -f -- "firefox.*--profile $PROFILE_PATH" || true
pkill -9 -u "$CURRENT_UID" -f -- "firefox-bin.*$PROFILE_PATH" || true
rm -f "$PROFILE_PATH/lock" "$PROFILE_PATH/.parentlock"
find "$PROFILE_PATH" -maxdepth 1 -type s -name '.parentlock-*' -delete 2>/dev/null || true

"$FIREFOX_BIN" --new-instance --profile "$PROFILE_PATH" --new-window "$TARGET_URL" >/dev/null 2>&1 &

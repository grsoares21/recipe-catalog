#!/bin/bash
# Runs the recipe bot in the background on macOS (a launchd agent that starts at login
# and restarts if it crashes). Usage: bot/install-macos.sh   |   bot/install-macos.sh uninstall
set -euo pipefail
label=com.recipecatalog.bot
plist=~/Library/LaunchAgents/$label.plist
logs=~/Library/Logs/recipe-bot.log

if [ "${1:-}" = uninstall ]; then
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  rm -f "$plist"
  echo "removed $label"
  exit 0
fi

bot=$(cd "$(dirname "$0")" && pwd)/bot.mjs
node=$(command -v node)
# launchd starts with a bare PATH: pass the one where node, claude, yt-dlp, ffmpeg and whisper-cli live.
path="$(dirname "$node"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
[ -f ~/.config/recipe-bot/config.json ] || { echo "missing ~/.config/recipe-bot/config.json (see bot/README.md)"; exit 1; }

cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key><array><string>$node</string><string>$bot</string></array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$path</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$logs</string>
  <key>StandardErrorPath</key><string>$logs</string>
</dict>
</plist>
EOF
launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$plist"
echo "running; logs in $logs"

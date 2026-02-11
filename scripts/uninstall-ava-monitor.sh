#!/bin/bash
# uninstall-ava-monitor.sh — Remove Ava monitor launchd service

set -euo pipefail

PLIST_NAME="com.automaker.ava-monitor"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"

if [ -f "$PLIST_DEST" ]; then
  echo "Stopping and removing service..."
  launchctl unload "$PLIST_DEST" 2>/dev/null || true
  rm -f "$PLIST_DEST"
  echo "Ava monitor uninstalled."
else
  echo "Service not installed (no plist at $PLIST_DEST)."
fi

echo ""
echo "Note: Logs are preserved at ~/Library/Logs/automaker/"
echo "To remove logs: rm -rf ~/Library/Logs/automaker/"

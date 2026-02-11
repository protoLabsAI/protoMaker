#!/bin/bash
# install-ava-monitor.sh — Install Ava monitor as a macOS launchd service
#
# Runs ava-monitor.sh every 5 minutes in the background.
# Logs to ~/Library/Logs/automaker/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PLIST_TEMPLATE="$SCRIPT_DIR/infra/com.automaker.ava-monitor.plist"
PLIST_NAME="com.automaker.ava-monitor"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"
LOG_DIR="$HOME/Library/Logs/automaker"

# Check prerequisites
if ! command -v claude &>/dev/null; then
  echo "Error: 'claude' CLI not found. Install it first."
  exit 1
fi

if [ ! -f "$PLIST_TEMPLATE" ]; then
  echo "Error: Plist template not found at $PLIST_TEMPLATE"
  exit 1
fi

# Unload existing service if running
if launchctl list "$PLIST_NAME" &>/dev/null; then
  echo "Stopping existing service..."
  launchctl unload "$PLIST_DEST" 2>/dev/null || true
fi

# Create log directory
mkdir -p "$LOG_DIR"

# Create LaunchAgents directory if needed
mkdir -p "$HOME/Library/LaunchAgents"

# Generate plist from template with path substitution
sed \
  -e "s|__AUTOMAKER_ROOT__|$PROJECT_DIR|g" \
  -e "s|__HOME__|$HOME|g" \
  "$PLIST_TEMPLATE" > "$PLIST_DEST"

# Make monitor script executable
chmod +x "$SCRIPT_DIR/ava-monitor.sh"

# Load the service
launchctl load "$PLIST_DEST"

echo "Ava monitor installed and started."
echo "  Service: $PLIST_NAME"
echo "  Interval: every 5 minutes"
echo "  Logs: $LOG_DIR/"
echo ""
echo "Commands:"
echo "  Check status:  launchctl list $PLIST_NAME"
echo "  Stop:          launchctl unload $PLIST_DEST"
echo "  Start:         launchctl load $PLIST_DEST"
echo "  Uninstall:     ./scripts/uninstall-ava-monitor.sh"

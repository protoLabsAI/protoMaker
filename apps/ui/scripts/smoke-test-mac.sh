#!/bin/bash
# macOS Smoke Test Installation Script
#
# This script:
# 1. Finds the DMG artifact
# 2. Mounts the DMG
# 3. Copies the app to /tmp/test-app/
# 4. Unmounts the DMG
# 5. Removes quarantine attributes to bypass Gatekeeper warnings
#
# Expected environment:
#   ARTIFACT_DIR - Directory containing the DMG file (default: artifacts/mac)

set -e

ARTIFACT_DIR="${ARTIFACT_DIR:-artifacts/mac}"
TEST_APP_DIR="/tmp/test-app"

echo "=== macOS Smoke Test Installation ==="

# Find the DMG file
DMG_FILE=$(find "$ARTIFACT_DIR" -name "*.dmg" -type f | head -n 1)

if [ -z "$DMG_FILE" ]; then
  echo "❌ Error: No DMG file found in $ARTIFACT_DIR"
  exit 1
fi

echo "✅ Found DMG: $DMG_FILE"

# Create test directory
rm -rf "$TEST_APP_DIR"
mkdir -p "$TEST_APP_DIR"

# Mount the DMG
echo "📦 Mounting DMG..."
MOUNT_OUTPUT=$(hdiutil attach "$DMG_FILE" -nobrowse -mountrandom /Volumes 2>&1)
VOLUME_PATH=$(echo "$MOUNT_OUTPUT" | grep "/Volumes" | awk '{print $3}')

if [ -z "$VOLUME_PATH" ]; then
  echo "❌ Error: Failed to mount DMG"
  echo "$MOUNT_OUTPUT"
  exit 1
fi

echo "✅ Mounted at: $VOLUME_PATH"

# Find the .app bundle
APP_BUNDLE=$(find "$VOLUME_PATH" -name "*.app" -maxdepth 1 -type d | head -n 1)

if [ -z "$APP_BUNDLE" ]; then
  echo "❌ Error: No .app bundle found in DMG"
  hdiutil detach "$VOLUME_PATH" || true
  exit 1
fi

echo "✅ Found app: $APP_BUNDLE"

# Copy app to test directory
echo "📋 Copying app to $TEST_APP_DIR..."
cp -R "$APP_BUNDLE" "$TEST_APP_DIR/"

# Unmount the DMG
echo "📤 Unmounting DMG..."
hdiutil detach "$VOLUME_PATH"

# Get the copied app path
COPIED_APP="$TEST_APP_DIR/$(basename "$APP_BUNDLE")"

# Remove quarantine attributes (bypass Gatekeeper)
echo "🔓 Removing quarantine attributes..."
xattr -cr "$COPIED_APP"

echo "✅ Installation complete!"
echo "   App location: $COPIED_APP"
echo "   Executable: $COPIED_APP/Contents/MacOS/protoLabs.studio"

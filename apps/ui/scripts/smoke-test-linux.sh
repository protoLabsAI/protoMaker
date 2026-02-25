#!/bin/bash
# Linux Smoke Test Installation Script
#
# This script:
# 1. Finds the AppImage artifact (primary test target)
# 2. Makes it executable
# 3. Copies to /tmp/test-app/
# 4. Also tests DEB installation (if available)
#
# Expected environment:
#   ARTIFACT_DIR - Directory containing AppImage and DEB files (default: artifacts/linux)

set -e

ARTIFACT_DIR="${ARTIFACT_DIR:-artifacts/linux}"
TEST_APP_DIR="/tmp/test-app"

echo "=== Linux Smoke Test Installation ==="

# Find the AppImage file
APPIMAGE_FILE=$(find "$ARTIFACT_DIR" -name "*.AppImage" -type f | head -n 1)

if [ -z "$APPIMAGE_FILE" ]; then
  echo "❌ Error: No AppImage file found in $ARTIFACT_DIR"
  exit 1
fi

echo "✅ Found AppImage: $APPIMAGE_FILE"

# Create test directory
rm -rf "$TEST_APP_DIR"
mkdir -p "$TEST_APP_DIR"

# Copy AppImage to test directory
COPIED_APPIMAGE="$TEST_APP_DIR/protoLabs.studio.AppImage"
cp "$APPIMAGE_FILE" "$COPIED_APPIMAGE"

# Make executable
echo "🔧 Making AppImage executable..."
chmod +x "$COPIED_APPIMAGE"

echo "✅ AppImage ready!"
echo "   Location: $COPIED_APPIMAGE"

# Test DEB installation if available
DEB_FILE=$(find "$ARTIFACT_DIR" -name "*.deb" -type f | head -n 1)

if [ -n "$DEB_FILE" ]; then
  echo ""
  echo "📦 Testing DEB installation..."
  echo "   Found DEB: $DEB_FILE"

  # Install DEB (requires sudo)
  if command -v dpkg >/dev/null 2>&1; then
    echo "   Installing DEB package..."
    sudo dpkg -i "$DEB_FILE" || {
      echo "⚠️  DEB installation failed (dependencies may be missing)"
      echo "   Attempting to fix dependencies..."
      sudo apt-get install -f -y || true
    }

    # Verify installation
    if command -v automaker >/dev/null 2>&1; then
      echo "✅ DEB package installed successfully!"
      echo "   Executable: $(which automaker)"
    else
      echo "⚠️  DEB package installed but executable not in PATH"
    fi
  else
    echo "⚠️  dpkg not available, skipping DEB test"
  fi
else
  echo ""
  echo "⚠️  No DEB file found, skipping DEB test"
fi

echo ""
echo "✅ Linux smoke test installation complete!"

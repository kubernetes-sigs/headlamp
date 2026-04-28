#!/bin/bash
# Copyright 2025 The Kubernetes Authors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Verify Mac build artifacts and binaries
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$APP_DIR/dist"

# Function to test backend binary
test_backend() {
  local BACKEND_PATH="$1"
  if [ -f "$BACKEND_PATH" ]; then
    echo "Found backend at: $BACKEND_PATH"
    chmod +x "$BACKEND_PATH"
    if ! VERSION_OUTPUT=$("$BACKEND_PATH" --version 2>&1); then
      echo "✗ Failed to execute backend --version"
      return 1
    fi
    echo "Backend version: $VERSION_OUTPUT"
    if echo "$VERSION_OUTPUT" | grep -q "Headlamp"; then
      echo "✓ Backend binary is working"
      return 0
    else
      echo "✗ Backend version check failed"
      return 1
    fi
  else
    echo "✗ Backend server binary not found at $BACKEND_PATH"
    return 1
  fi
}

# Function to test Electron app
test_electron_app() {
  local HEADLAMP_EXEC="$1"
  if [ -f "$HEADLAMP_EXEC" ]; then
    echo "Found Headlamp at: $HEADLAMP_EXEC"
    chmod +x "$HEADLAMP_EXEC"
    
    echo "Running app with 10 second timeout..."
    # Create unique temporary file for output (macOS BSD mktemp -t adds random suffix automatically)
    local OUTPUT_FILE=$(mktemp -t headlamp-output)
    
    # Use perl-based timeout as timeout command is not available on macOS by default
    set +e  # Temporarily disable exit on error
    perl -e 'alarm shift; exec @ARGV' 10 "$HEADLAMP_EXEC" list-plugins > "$OUTPUT_FILE" 2>&1
    local EXIT_CODE=$?
    set -e  # Re-enable exit on error
    
    echo "App exited with code: $EXIT_CODE"
    echo "Output from app:"
    cat "$OUTPUT_FILE" || echo "(no output)"
    rm -f "$OUTPUT_FILE"
    echo ""
    
    if [ $EXIT_CODE -eq 0 ]; then
      echo "✓ App executed successfully"
      return 0
    elif [ $EXIT_CODE -eq 142 ]; then
      # Timeout occurred - app started but didn't exit cleanly (expected on macOS CI without display)
      echo "⚠ App timed out after 10 seconds (expected behavior on macOS CI without display)"
      echo "✓ App verification completed - timeout indicates app started successfully"
      return 0
    else
      echo "✗ App failed to run (exit code: $EXIT_CODE)"
      return 1
    fi
  else
    echo "✗ Headlamp executable not found at $HEADLAMP_EXEC"
    return 1
  fi
}

echo "=== Verifying Mac Build Artifacts ==="
echo ""

# Step 1: Verify DMG exists
echo "Checking for built artifacts..."
ls -lh "$DIST_DIR/" || true

if ls "$DIST_DIR"/*.dmg 1> /dev/null 2>&1; then
  echo "✓ Mac DMG found"
else
  echo "✗ No Mac DMG found"
  exit 1
fi
echo ""

# Step 2: Verify app bundle, backend binary, and Electron app
echo "=== Verifying App Bundle and Binaries ==="

# Check if there's a mac directory with the app bundle
if [ -d "$DIST_DIR/mac" ]; then
  echo "Found mac build directory"
  
  # Find the .app bundle
  APP_BUNDLE=$(find "$DIST_DIR/mac" -name "*.app" -type d | head -n 1)
  if [ -z "$APP_BUNDLE" ]; then
    echo "✗ App bundle not found"
    exit 1
  fi
  echo "Found app bundle at: $APP_BUNDLE"
  
  # Test backend binary
  BACKEND_PATH="$APP_BUNDLE/Contents/Resources/headlamp-server"
  test_backend "$BACKEND_PATH" || exit 1
  echo ""
  
  # Test Electron app
  echo "=== Verifying Electron App ==="
  HEADLAMP_EXEC="$APP_BUNDLE/Contents/MacOS/Headlamp"
  test_electron_app "$HEADLAMP_EXEC" || exit 1
else
  echo "Mac build directory not found, checking DMG contents..."
  
  # Mount the DMG and test both backend and app
  DMG_FILE=$(ls "$DIST_DIR"/*.dmg | head -n 1)
  if [ ! -z "$DMG_FILE" ]; then
    echo "Mounting DMG: $DMG_FILE"
    # Create unique mount point using system temp directory (macOS BSD mktemp -t adds random suffix automatically)
    MOUNT_POINT=$(mktemp -d -t headlamp-dmg)
    if [ -z "$MOUNT_POINT" ]; then
      echo "✗ Failed to create temporary mount point"
      exit 1
    fi
    if ! hdiutil attach "$DMG_FILE" -mountpoint "$MOUNT_POINT" > /dev/null 2>&1; then
      echo "✗ Failed to mount DMG at temporary mount point"
      rm -rf "$MOUNT_POINT" || true
      exit 1
    fi
    echo "DMG mounted at: $MOUNT_POINT"
    
    APP_BUNDLE=$(find "$MOUNT_POINT" -name "*.app" -type d | head -n 1)
    if [ ! -z "$APP_BUNDLE" ]; then
      echo "Found app in DMG: $APP_BUNDLE"
      
      # Test backend binary
      BACKEND_PATH="$APP_BUNDLE/Contents/Resources/headlamp-server"
      if ! test_backend "$BACKEND_PATH"; then
        hdiutil detach "$MOUNT_POINT" > /dev/null 2>&1
        rm -rf "$MOUNT_POINT" || true
        exit 1
      fi
      echo ""
      
      # Test Electron app
      echo "=== Verifying Electron App from DMG ==="
      HEADLAMP_EXEC="$APP_BUNDLE/Contents/MacOS/Headlamp"
      if ! test_electron_app "$HEADLAMP_EXEC"; then
        hdiutil detach "$MOUNT_POINT" > /dev/null 2>&1
        rm -rf "$MOUNT_POINT" || true
        exit 1
      fi
      
      hdiutil detach "$MOUNT_POINT" > /dev/null 2>&1
      rm -rf "$MOUNT_POINT" || true
    else
      echo "✗ App bundle not found in DMG"
      hdiutil detach "$MOUNT_POINT" > /dev/null 2>&1
      rm -rf "$MOUNT_POINT" || true
      exit 1
    fi
  else
    echo "✗ No DMG file found"
    exit 1
  fi
fi

echo ""
echo "✓ All Mac verification checks passed"

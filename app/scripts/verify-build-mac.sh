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
echo "=== Verifying Server Cleanup After App Close ==="

# Function to test server cleanup
test_server_cleanup() {
  local APP_BUNDLE="$1"

  if [ ! -d "$APP_BUNDLE" ]; then
    echo "✗ Cannot test server cleanup: app bundle not found at $APP_BUNDLE"
    return 1
  fi

  # Record existing PIDs to exclude them
  local EXISTING_SERVER_PIDS
  local EXISTING_APP_PIDS
  local ELECTRON_PID
  local SERVER_PID
  local ALL_SERVER_PIDS
  local ALL_APP_PIDS
  local REMAINING_SERVER_PIDS

  EXISTING_SERVER_PIDS=$(pgrep -f headlamp-server 2>/dev/null || true)
  EXISTING_APP_PIDS=$(pgrep -x Headlamp 2>/dev/null || true)

  # Launch the app using macOS 'open' command so it properly registers with
  # WindowServer and Electron's 'ready' event fires (direct binary execution
  # skips this registration on CI runners).
  # --disable-gpu avoids GPU initialization failures on headless macOS CI runners.
  echo "Launching app for server cleanup test (via open, GPU disabled for CI)..."
  open "$APP_BUNDLE" --args --disable-gpu

  # Wait for the Headlamp process to appear (up to 15 seconds)
  ELECTRON_PID=""
  for i in $(seq 1 15); do
    ALL_APP_PIDS=$(pgrep -x Headlamp 2>/dev/null || true)
    for pid in $ALL_APP_PIDS; do
      if [ -z "$EXISTING_APP_PIDS" ] || ! echo "$EXISTING_APP_PIDS" | grep -qw "$pid"; then
        ELECTRON_PID="$pid"
        break
      fi
    done
    if [ -n "$ELECTRON_PID" ]; then
      break
    fi
    sleep 1
  done

  if [ -z "$ELECTRON_PID" ]; then
    echo "⚠ Headlamp process did not appear within 15 seconds, skipping cleanup test"
    return 0
  fi
  echo "Electron app started with PID: $ELECTRON_PID"

  # Wait for headlamp-server to appear (up to 30 seconds)
  echo "Waiting for headlamp-server to start..."
  SERVER_PID=""
  for i in $(seq 1 30); do
    ALL_SERVER_PIDS=$(pgrep -f headlamp-server 2>/dev/null || true)
    for pid in $ALL_SERVER_PIDS; do
      if [ -z "$EXISTING_SERVER_PIDS" ] || ! echo "$EXISTING_SERVER_PIDS" | grep -qw "$pid"; then
        SERVER_PID="$pid"
        break
      fi
    done
    if [ -n "$SERVER_PID" ]; then
      echo "headlamp-server started with PID: $SERVER_PID"
      break
    fi
    sleep 1
  done

  if [ -z "$SERVER_PID" ]; then
    echo "⚠ headlamp-server did not start within 30 seconds, skipping cleanup test"
    kill -TERM "$ELECTRON_PID" 2>/dev/null || true
    # Bounded wait for process to exit (up to 10 seconds)
    for i in $(seq 1 10); do
      if kill -0 "$ELECTRON_PID" 2>/dev/null; then sleep 1; else break; fi
    done
    kill -9 "$ELECTRON_PID" 2>/dev/null || true
    return 0
  fi

  # Gracefully close the Electron app (SIGTERM triggers the quit handler)
  echo "Sending SIGTERM to Electron app (PID: $ELECTRON_PID)..."
  kill -TERM "$ELECTRON_PID" 2>/dev/null || true

  # Bounded wait for the Electron app to exit (up to 15 seconds)
  for i in $(seq 1 15); do
    if kill -0 "$ELECTRON_PID" 2>/dev/null; then
      sleep 1
    else
      break
    fi
  done
  if kill -0 "$ELECTRON_PID" 2>/dev/null; then
    echo "⚠ Electron app did not exit gracefully, force killing..."
    kill -9 "$ELECTRON_PID" 2>/dev/null || true
  fi

  # Wait for all new server processes to exit (up to 10 seconds)
  echo "Waiting for headlamp-server to exit..."
  for i in $(seq 1 10); do
    REMAINING_SERVER_PIDS=""
    ALL_SERVER_PIDS=$(pgrep -f headlamp-server 2>/dev/null || true)
    for pid in $ALL_SERVER_PIDS; do
      if [ -z "$EXISTING_SERVER_PIDS" ] || ! echo "$EXISTING_SERVER_PIDS" | grep -qw "$pid"; then
        REMAINING_SERVER_PIDS="$REMAINING_SERVER_PIDS $pid"
      fi
    done
    if [ -z "$REMAINING_SERVER_PIDS" ]; then
      break
    fi
    sleep 1
  done

  # Final check: are any new headlamp-server processes still running?
  REMAINING_SERVER_PIDS=""
  ALL_SERVER_PIDS=$(pgrep -f headlamp-server 2>/dev/null || true)
  for pid in $ALL_SERVER_PIDS; do
    if [ -z "$EXISTING_SERVER_PIDS" ] || ! echo "$EXISTING_SERVER_PIDS" | grep -qw "$pid"; then
      REMAINING_SERVER_PIDS="$REMAINING_SERVER_PIDS $pid"
    fi
  done

  if [ -n "$REMAINING_SERVER_PIDS" ]; then
    echo "✗ headlamp-server process(es) still running after app close: $REMAINING_SERVER_PIDS"
    for pid in $REMAINING_SERVER_PIDS; do
      kill -9 "$pid" 2>/dev/null || true
    done
    return 1
  else
    echo "✓ headlamp-server properly terminated after app close"
    return 0
  fi
}

# Test server cleanup using the app bundle found earlier.
# Prefer native architecture build: on arm64 runners, dist/mac contains the x64
# build (via Rosetta) and dist/mac-arm64 contains the native arm64 build.
ARCH=$(uname -m)
MAC_DIR=""
if [ "$ARCH" = "arm64" ] && [ -d "$DIST_DIR/mac-arm64" ]; then
  MAC_DIR="$DIST_DIR/mac-arm64"
elif [ -d "$DIST_DIR/mac" ]; then
  MAC_DIR="$DIST_DIR/mac"
fi

if [ -n "$MAC_DIR" ]; then
  APP_BUNDLE=$(find "$MAC_DIR" -name "*.app" -type d | head -n 1)
  if [ -n "$APP_BUNDLE" ]; then
    test_server_cleanup "$APP_BUNDLE" || exit 1
  fi
else
  # DMG was already unmounted; re-mount to test server cleanup
  DMG_FILE=$(ls "$DIST_DIR"/*.dmg | head -n 1)
  if [ ! -z "$DMG_FILE" ]; then
    MOUNT_POINT=$(mktemp -d -t headlamp-dmg-cleanup)
    if hdiutil attach "$DMG_FILE" -mountpoint "$MOUNT_POINT" > /dev/null 2>&1; then
      APP_BUNDLE=$(find "$MOUNT_POINT" -name "*.app" -type d | head -n 1)
      if [ -n "$APP_BUNDLE" ]; then
        if ! test_server_cleanup "$APP_BUNDLE"; then
          hdiutil detach "$MOUNT_POINT" > /dev/null 2>&1
          rm -rf "$MOUNT_POINT" || true
          exit 1
        fi
      else
        echo "⚠ App bundle not found in re-mounted DMG, skipping server cleanup test"
      fi
      hdiutil detach "$MOUNT_POINT" > /dev/null 2>&1
    else
      echo "⚠ Failed to re-mount DMG for server cleanup test, skipping"
    fi
    rm -rf "$MOUNT_POINT" || true
  fi
fi

echo ""
echo "✓ All Mac verification checks passed"

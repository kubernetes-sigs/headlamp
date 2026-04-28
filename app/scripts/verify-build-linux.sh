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

# Verify Linux build artifacts and binaries
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$APP_DIR/dist"

echo "=== Verifying Linux Build Artifacts ==="
echo ""

# Step 1: Verify artifacts exist
echo "Checking for built artifacts..."
ls -lh "$DIST_DIR/" || true

if ls "$DIST_DIR"/*.AppImage 1> /dev/null 2>&1 || ls "$DIST_DIR"/*.tar.gz 1> /dev/null 2>&1; then
  echo "✓ Linux artifacts found"
else
  echo "✗ No Linux artifacts found"
  exit 1
fi
echo ""

# Step 2: Extract and verify backend binary
echo "=== Verifying Backend Binary ==="
# Try to find any Linux tarball (x64, arm64, armv7l, etc.)
# Prefer x64 if available, otherwise use the first one found
TARBALL=$(ls "$DIST_DIR"/*-linux-x64.tar.gz 2>/dev/null | head -n 1)
if [ -z "$TARBALL" ]; then
  TARBALL=$(ls "$DIST_DIR"/*-linux-*.tar.gz 2>/dev/null | head -n 1)
fi
if [ ! -z "$TARBALL" ]; then
  echo "Extracting tar.gz: $TARBALL"
  EXTRACT_DIR=$(mktemp -d)
  tar -xzf "$TARBALL" -C "$EXTRACT_DIR"
  
  # Find the backend server binary
  BACKEND_PATH=$(find "$EXTRACT_DIR" -name "headlamp-server" -type f | head -n 1)
  if [ -z "$BACKEND_PATH" ]; then
    echo "✗ Backend server binary not found in package"
    rm -rf "$EXTRACT_DIR"
    exit 1
  fi
  echo "Found backend at: $BACKEND_PATH"
  
  # Test version command
  chmod +x "$BACKEND_PATH"
  if ! VERSION_OUTPUT=$("$BACKEND_PATH" --version 2>&1); then
    echo "✗ Failed to execute backend --version"
    rm -rf "$EXTRACT_DIR"
    exit 1
  fi
  echo "Backend version: $VERSION_OUTPUT"
  if echo "$VERSION_OUTPUT" | grep -q "Headlamp"; then
    echo "✓ Backend binary is working"
  else
    echo "✗ Backend version check failed"
    rm -rf "$EXTRACT_DIR"
    exit 1
  fi
  echo ""
  
  # Step 3: Verify Electron app can run
  echo "=== Verifying Electron App ==="
  echo "Reusing extracted files for app testing..."
  
  # Find the headlamp executable
  HEADLAMP_EXEC=$(find "$EXTRACT_DIR" -name "headlamp" -type f -executable | head -n 1)
  if [ -z "$HEADLAMP_EXEC" ]; then
    echo "✗ Headlamp executable not found"
    rm -rf "$EXTRACT_DIR"
    exit 1
  fi
  echo "Found Headlamp at: $HEADLAMP_EXEC"
  
  # Create unique temporary file for output
  OUTPUT_FILE=$(mktemp)
  
  # Run with list-plugins command (exits immediately, no GUI needed)
  chmod +x "$HEADLAMP_EXEC"
  set +e
  timeout 30 "$HEADLAMP_EXEC" list-plugins > "$OUTPUT_FILE" 2>&1
  EXIT_CODE=$?
  set -e
  if [ $EXIT_CODE -eq 0 ]; then
    echo "✓ App executed successfully"
    cat "$OUTPUT_FILE"
  elif [ $EXIT_CODE -eq 124 ]; then
    echo "✗ App timed out"
    cat "$OUTPUT_FILE" || true
    rm -rf "$EXTRACT_DIR"
    rm -f "$OUTPUT_FILE"
    exit 1
  else
    echo "✗ App failed to run (exit code: $EXIT_CODE)"
    cat "$OUTPUT_FILE" || true
    rm -rf "$EXTRACT_DIR"
    rm -f "$OUTPUT_FILE"
    exit 1
  fi
  
  # Cleanup
  rm -rf "$EXTRACT_DIR"
  rm -f "$OUTPUT_FILE"
  echo ""
  echo "✓ All Linux verification checks passed"
else
  echo "✗ No Linux tar.gz found for verification"
  exit 1
fi

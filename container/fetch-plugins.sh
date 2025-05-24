#!/bin/bash
# Enhanced fetch-plugins.sh with checksum verification

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST_FILE="${SCRIPT_DIR}/build-manifest.json"
PLUGINS_DIR="${1:-/headlamp/plugins}"

# Create plugins directory if it doesn't exist
mkdir -p "${PLUGINS_DIR}"

# Function to download and verify a plugin
download_and_verify_plugin() {
  local name="$1"
  local version="$2"
  local url="$3"
  local checksum="$4"
  local output_file="${PLUGINS_DIR}/${name}-${version}.tgz"
  
  echo "Downloading plugin: ${name} v${version}"
  
  # Download the plugin
  if ! curl -sSL "${url}" -o "${output_file}"; then
    echo "Error downloading ${name} v${version} from ${url}"
    return 1
  fi
  
  # Verify checksum if provided
  if [ -n "${checksum}" ]; then
    echo "Verifying checksum for ${name} v${version}"
    
    # Calculate SHA256 checksum
    local calculated_checksum
    if command -v sha256sum > /dev/null; then
      calculated_checksum=$(sha256sum "${output_file}" | cut -d ' ' -f 1)
    elif command -v shasum > /dev/null; then
      calculated_checksum=$(shasum -a 256 "${output_file}" | cut -d ' ' -f 1)
    else
      echo "Warning: No checksum tool found (sha256sum or shasum). Skipping verification."
      return 0
    fi
    
    # Compare checksums
    if [ "${calculated_checksum}" != "${checksum}" ]; then
      echo "Error: Checksum verification failed for ${name} v${version}"
      echo "Expected: ${checksum}"
      echo "Got:      ${calculated_checksum}"
      rm -f "${output_file}"
      return 1
    fi
    
    echo "Checksum verified for ${name} v${version}"
  else
    echo "Warning: No checksum provided for ${name} v${version}. Skipping verification."
  fi
}

# Parse the manifest file and download plugins
if [ -f "${MANIFEST_FILE}" ]; then
  echo "Using manifest file: ${MANIFEST_FILE}"
  
  # Extract plugins from the manifest
  plugins=$(jq -r '.plugins[] | "\(.name)|\(.version)|\(.url)|\(.checksum // \"\")"' "${MANIFEST_FILE}")
  
  # Download and verify each plugin
  echo "${plugins}" | while IFS='|' read -r name version url checksum; do
    download_and_verify_plugin "${name}" "${version}" "${url}" "${checksum}"
  done
else
  echo "Error: Manifest file not found: ${MANIFEST_FILE}"
  exit 1
fi

echo "All plugins downloaded and verified successfully"
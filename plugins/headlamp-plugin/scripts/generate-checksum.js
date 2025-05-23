#!/usr/bin/env node

/**
 * Generate SHA256 checksum for plugin packages
 * 
 * This script calculates SHA256 checksums for plugin packages
 * and can update manifest files with the checksums.
 * 
 * Usage: node generate-checksum.js [options] <file>
 * 
 * Options:
 *   --update-manifest <path>  Update the specified manifest file with the checksum
 *   --plugin-name <name>      Plugin name (required with --update-manifest)
 *   --plugin-version <ver>    Plugin version (required with --update-manifest)
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
let filePath = null;
let updateManifest = null;
let pluginName = null;
let pluginVersion = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--update-manifest' && i + 1 < args.length) {
    updateManifest = args[++i];
  } else if (args[i] === '--plugin-name' && i + 1 < args.length) {
    pluginName = args[++i];
  } else if (args[i] === '--plugin-version' && i + 1 < args.length) {
    pluginVersion = args[++i];
  } else if (!filePath) {
    filePath = args[i];
  }
}

// Function to calculate SHA256 checksum of a file
function calculateChecksum(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    stream.on('error', err => reject(err));
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

// Function to update manifest file with checksum
function updateManifestFile(manifestPath, pluginName, pluginVersion, checksum) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    
    if (!manifest.plugins || !Array.isArray(manifest.plugins)) {
      console.error('Error: Invalid manifest file format. Expected "plugins" array.');
      return false;
    }
    
    let updated = false;
    
    // Find and update the plugin entry
    for (const plugin of manifest.plugins) {
      if (plugin.name === pluginName && plugin.version === pluginVersion) {
        plugin.checksum = checksum;
        updated = true;
        break;
      }
    }
    
    if (!updated) {
      console.error(`Error: Plugin ${pluginName} v${pluginVersion} not found in manifest.`);
      return false;
    }
    
    // Write the updated manifest back to file
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Updated manifest file: ${manifestPath}`);
    return true;
  } catch (error) {
    console.error(`Error updating manifest: ${error.message}`);
    return false;
  }
}

// Main function
async function main() {
  // Check if file path is provided
  if (!filePath) {
    console.error('Error: No file specified.');
    console.log('Usage: node generate-checksum.js [options] <file>');
    process.exit(1);
  }
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }
  
  try {
    // Calculate checksum
    const checksum = await calculateChecksum(filePath);
    console.log(`SHA256 (${filePath}) = ${checksum}`);
    
    // Update manifest if requested
    if (updateManifest) {
      if (!pluginName || !pluginVersion) {
        console.error('Error: --plugin-name and --plugin-version are required with --update-manifest');
        process.exit(1);
      }
      
      if (!fs.existsSync(updateManifest)) {
        console.error(`Error: Manifest file not found: ${updateManifest}`);
        process.exit(1);
      }
      
      const success = updateManifestFile(updateManifest, pluginName, pluginVersion, checksum);
      if (!success) {
        process.exit(1);
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
main();
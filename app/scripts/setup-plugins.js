/**
 * Enhanced setup-plugins.js with checksum verification
 * This script downloads and verifies plugins for Headlamp
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

// Get the manifest file path
const manifestPath = path.join(__dirname, '..', 'app-build-manifest.json');
const pluginsDir = process.argv[2] || path.join(__dirname, '..', 'plugins');

// Create plugins directory if it doesn't exist
if (!fs.existsSync(pluginsDir)) {
  fs.mkdirSync(pluginsDir, { recursive: true });
}

// Function to download a file with promise
function downloadFile(url, filePath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(filePath, () => {});
      reject(err);
    });
  });
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

// Function to download and verify a plugin
async function downloadAndVerifyPlugin(name, version, url, expectedChecksum) {
  const outputFile = path.join(pluginsDir, `${name}-${version}.tgz`);
  
  console.log(`Downloading plugin: ${name} v${version}`);
  
  try {
    // Download the plugin
    await downloadFile(url, outputFile);
    
    // Verify checksum if provided
    if (expectedChecksum) {
      console.log(`Verifying checksum for ${name} v${version}`);
      
      const calculatedChecksum = await calculateChecksum(outputFile);
      
      if (calculatedChecksum !== expectedChecksum) {
        console.error(`Error: Checksum verification failed for ${name} v${version}`);
        console.error(`Expected: ${expectedChecksum}`);
        console.error(`Got:      ${calculatedChecksum}`);
        fs.unlinkSync(outputFile);
        return false;
      }
      
      console.log(`Checksum verified for ${name} v${version}`);
    } else {
      console.warn(`Warning: No checksum provided for ${name} v${version}. Skipping verification.`);
    }
    
    return true;
  } catch (error) {
    console.error(`Error downloading ${name} v${version}: ${error.message}`);
    return false;
  }
}

// Main function
async function main() {
  try {
    // Read and parse the manifest file
    if (!fs.existsSync(manifestPath)) {
      console.error(`Error: Manifest file not found: ${manifestPath}`);
      process.exit(1);
    }
    
    console.log(`Using manifest file: ${manifestPath}`);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    
    if (!manifest.plugins || !Array.isArray(manifest.plugins)) {
      console.error('Error: Invalid manifest file format. Expected "plugins" array.');
      process.exit(1);
    }
    
    // Download and verify each plugin
    const results = await Promise.all(
      manifest.plugins.map(plugin => 
        downloadAndVerifyPlugin(plugin.name, plugin.version, plugin.url, plugin.checksum)
      )
    );
    
    // Check if all plugins were downloaded and verified successfully
    if (results.every(result => result)) {
      console.log('All plugins downloaded and verified successfully');
    } else {
      console.error('Some plugins failed to download or verify');
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
main();
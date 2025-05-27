#!/usr/bin/env node

/**
 * Script to build both OCI image and plugin tarball for release
 * 
 * Usage: node build-plugin-release.js <plugin-path>
 * 
 * This script:
 * 1. Builds the plugin
 * 2. Creates a tarball of the plugin
 * 3. Optionally builds an OCI image if the plugin has the in-cluster tag
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get the plugin path from command line arguments
const pluginPath = process.argv[2];

if (!pluginPath) {
  console.error('Error: Plugin path is required');
  console.error('Usage: node build-plugin-release.js <plugin-path>');
  process.exit(1);
}

const absolutePluginPath = path.resolve(pluginPath);

// Check if the plugin path exists
if (!fs.existsSync(absolutePluginPath)) {
  console.error(`Error: Plugin path "${absolutePluginPath}" does not exist`);
  process.exit(1);
}

// Check if package.json exists
const packageJsonPath = path.join(absolutePluginPath, 'package.json');
if (!fs.existsSync(packageJsonPath)) {
  console.error(`Error: package.json not found in "${absolutePluginPath}"`);
  process.exit(1);
}

// Read package.json
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const pluginName = packageJson.name;
const pluginVersion = packageJson.version;

console.log(`Building plugin: ${pluginName} v${pluginVersion}`);

// Check if artifacthub.yaml exists to determine if OCI image should be built
const artifactHubPath = path.join(absolutePluginPath, 'artifacthub.yaml');
let buildOCI = false;
let hasInClusterTag = false;

if (fs.existsSync(artifactHubPath)) {
  const artifactHubContent = fs.readFileSync(artifactHubPath, 'utf8');
  hasInClusterTag = artifactHubContent.includes('in-cluster');
  buildOCI = hasInClusterTag;
  
  console.log(`ArtifactHub configuration found. Build OCI: ${buildOCI}`);
} else {
  console.log('No ArtifactHub configuration found. Will not build OCI image.');
}

// Create output directory - use environment variable if set, otherwise use 'dist'
const outputDir = process.env.OUTPUT_DIR || path.join(process.cwd(), 'dist');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

try {
  // Step 1: Build the plugin
  console.log('Building plugin...');
  execSync(`npx @kinvolk/headlamp-plugin build "${absolutePluginPath}"`, { 
    stdio: 'inherit',
    cwd: process.cwd()
  });
  
  // Step 2: Create tarball
  console.log('Creating plugin tarball...');
  execSync(`npx @kinvolk/headlamp-plugin package "${absolutePluginPath}" "${outputDir}"`, {
    stdio: 'inherit',
    cwd: process.cwd()
  });
  
  // Step 3: Build OCI image if needed
  if (buildOCI) {
    console.log('Building OCI image...');
    
    // Sanitize plugin name for Docker tag
    const sanitizedName = pluginName.replace(/@/g, '').replace(/\//g, '-');
    const dockerTag = `${sanitizedName}:${pluginVersion}`;
    
    // Build the Docker image using the Dockerfile.plugins
    const dockerfilePath = path.resolve(__dirname, '..', 'Dockerfile.plugins');
    
    execSync(`docker build -t ${dockerTag} -f "${dockerfilePath}" --build-arg PLUGIN_PATH="${absolutePluginPath}" .`, {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..')
    });
    
    console.log(`OCI image built: ${dockerTag}`);
  }
  
  console.log('\nBuild completed successfully!');
  console.log(`Plugin tarball available in: ${outputDir}`);
  
  if (buildOCI) {
    console.log(`OCI image built with tag: ${pluginName.replace(/@/g, '').replace(/\//g, '-')}:${pluginVersion}`);
    console.log('To push the image, use: docker push <image-tag>');
  }
  
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
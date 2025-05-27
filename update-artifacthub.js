#!/usr/bin/env node

/**
 * Script to update ArtifactHub package file for a plugin
 * 
 * Usage: node update-artifacthub.js <plugin-path> [--registry=<registry>]
 * 
 * This script:
 * 1. Updates the version in the artifacthub.yaml file
 * 2. Updates the repository URL if specified
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const pluginPath = args[0];

if (!pluginPath) {
  console.error('Error: Plugin path is required');
  console.error('Usage: node update-artifacthub.js <plugin-path> [--registry=<registry>]');
  process.exit(1);
}

// Check for registry option
let registry = null;
for (const arg of args) {
  if (arg.startsWith('--registry=')) {
    registry = arg.split('=')[1];
    break;
  }
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

// Check if artifacthub.yaml exists
const artifactHubPath = path.join(absolutePluginPath, 'artifacthub.yaml');
if (!fs.existsSync(artifactHubPath)) {
  console.error(`Error: artifacthub.yaml not found in "${absolutePluginPath}"`);
  process.exit(1);
}

// Read package.json
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const pluginName = packageJson.name;
const pluginVersion = packageJson.version;

console.log(`Updating ArtifactHub package file for: ${pluginName} v${pluginVersion}`);

// Read artifacthub.yaml
const artifactHubContent = fs.readFileSync(artifactHubPath, 'utf8');

// Simple YAML update without requiring a dependency
let updatedContent = artifactHubContent;

// Update version
updatedContent = updatedContent.replace(/version:.*/, `version: ${pluginVersion}`);

// Update repository if specified
if (registry) {
  const sanitizedName = pluginName.replace(/@/g, '').replace(/\//g, '-');
  const repoUrl = `${registry}/${sanitizedName}`;
  
  if (updatedContent.includes('repository:')) {
    updatedContent = updatedContent.replace(/repository:.*/, `repository: ${repoUrl}`);
  } else {
    updatedContent += `\nrepository: ${repoUrl}`;
  }
}

// Write updated artifacthub.yaml
try {
  fs.writeFileSync(artifactHubPath, updatedContent);
  console.log(`Updated artifacthub.yaml with version ${pluginVersion}`);
  if (registry) {
    console.log(`Updated repository to ${registry}/${pluginName.replace(/@/g, '').replace(/\//g, '-')}`);
  }
} catch (error) {
  console.error(`Error writing artifacthub.yaml: ${error.message}`);
  process.exit(1);
}

console.log('ArtifactHub package file updated successfully!');
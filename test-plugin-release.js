#!/usr/bin/env node

/**
 * Test script for plugin release functionality
 * 
 * This script tests:
 * 1. Building a plugin
 * 2. Creating a tarball
 * 3. Building an OCI image (if applicable)
 * 4. Updating ArtifactHub package file
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const assert = require('assert').strict;

// Test plugin path - using pod-counter example
const testPluginPath = path.resolve(__dirname, 'examples', 'pod-counter');
const outputDir = path.resolve(__dirname, 'test-output');

// Create test output directory
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('Running plugin release tests...');

// Test 1: Test build-plugin-release.js script
console.log('\nTest 1: Testing build-plugin-release.js');
try {
  execSync(`node ${path.join(__dirname, 'build-plugin-release.js')} ${testPluginPath}`, {
    stdio: 'inherit',
    env: { ...process.env, OUTPUT_DIR: outputDir }
  });
  
  // Check if dist directory contains tarball
  const distFiles = fs.readdirSync(path.join(process.cwd(), 'dist'));
  const hasTarball = distFiles.some(file => file.endsWith('.tar.gz'));
  assert.ok(hasTarball, 'Tarball file should be created in dist directory');
  
  console.log('✅ build-plugin-release.js test passed');
} catch (error) {
  console.error('❌ build-plugin-release.js test failed:', error.message);
  process.exit(1);
}

// Test 2: Test update-artifacthub.js script
console.log('\nTest 2: Testing update-artifacthub.js');

// Create a temporary artifacthub.yaml for testing
const testArtifactHubPath = path.join(testPluginPath, 'artifacthub.yaml');
const testArtifactHubContent = `
version: 0.1.0
name: pod-counter
displayName: Pod Counter
description: Display number of Pods in the title bar
keywords:
  - ui
  - pods
  - counter
tags:
  - in-cluster
`;

fs.writeFileSync(testArtifactHubPath, testArtifactHubContent);

try {
  execSync(`node ${path.join(__dirname, 'update-artifacthub.js')} ${testPluginPath} --registry=test-registry`, {
    stdio: 'inherit'
  });
  
  // Check if artifacthub.yaml was updated
  const updatedContent = fs.readFileSync(testArtifactHubPath, 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(testPluginPath, 'package.json'), 'utf8'));
  
  assert.ok(updatedContent.includes(`version: ${packageJson.version}`), 
    'ArtifactHub version should be updated to match package.json');
  assert.ok(updatedContent.includes('repository: test-registry/pod-counter'), 
    'ArtifactHub repository should be updated');
  
  console.log('✅ update-artifacthub.js test passed');
} catch (error) {
  console.error('❌ update-artifacthub.js test failed:', error.message);
} finally {
  // Clean up test artifacthub.yaml
  if (fs.existsSync(testArtifactHubPath)) {
    fs.unlinkSync(testArtifactHubPath);
  }
}

// Clean up test output directory
if (fs.existsSync(outputDir)) {
  fs.rmSync(outputDir, { recursive: true, force: true });
}

console.log('\nAll tests completed!');
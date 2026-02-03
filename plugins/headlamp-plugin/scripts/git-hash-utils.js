#!/usr/bin/env node

/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Shared utilities for git hash tracking used by bundling scripts.
 * These hashing functions make development faster by meaning the plugins
 * are not copied again and again if they don't change.
 */

const fs = require('fs-extra');
const { execSync } = require('child_process');

/**
 * Get the stored hash from a hash file
 * @param {string} hashFile - Path to the hash file
 * @returns {string|null} - The stored hash or null if file doesn't exist
 */
function getStoredHash(hashFile) {
  if (fs.existsSync(hashFile)) {
    return fs.readFileSync(hashFile, 'utf8').trim();
  }
  return null;
}

/**
 * Store a hash to a hash file
 * @param {string} hashFile - Path to the hash file
 * @param {string} hash - The hash to store
 */
function storeHash(hashFile, hash) {
  fs.writeFileSync(hashFile, hash);
}

/**
 * Get the git hash of a local directory path
 * @param {string} dirPath - The directory path relative to git root (e.g., 'plugins/examples')
 * @param {string} cwd - The working directory to run git command from
 * @returns {string|null} - The git hash or null if git is not available
 */
function getLocalGitHash(dirPath, cwd) {
  try {
    const output = execSync(`git log -1 --format=%H -- ${dirPath}`, {
      cwd: cwd,
      encoding: 'utf8',
    });
    return output.trim();
  } catch (error) {
    console.log('Git not available or not in a git repository');
    return null;
  }
}

/**
 * Get the remote git hash from a repository
 * @param {string} repoUrl - The repository URL
 * @returns {string|null} - The remote hash or null if failed
 */
function getRemoteGitHash(repoUrl) {
  try {
    const output = execSync(`git ls-remote ${repoUrl} HEAD`, {
      encoding: 'utf8',
    });
    return output.split('\t')[0].trim();
  } catch (error) {
    console.error('Failed to get remote hash:', error.message);
    return null;
  }
}

/**
 * Check if a directory should be skipped based on hash comparison
 * @param {string} targetDir - The target directory to check
 * @param {string} hashFile - Path to the hash file
 * @param {string} currentHash - The current hash to compare against
 * @returns {boolean} - True if should skip, false otherwise
 */
function shouldSkipBasedOnHash(targetDir, hashFile, currentHash) {
  // Check if directory exists and has content
  if (!fs.existsSync(targetDir)) {
    return false;
  }

  const entries = fs.readdirSync(targetDir).filter(e => e !== '.git-hash');
  if (entries.length === 0) {
    return false;
  }

  // Check if hashes match
  const storedHash = getStoredHash(hashFile);

  if (!currentHash || !storedHash) {
    return false;
  }

  return currentHash === storedHash;
}

module.exports = {
  getStoredHash,
  storeHash,
  getLocalGitHash,
  getRemoteGitHash,
  shouldSkipBasedOnHash,
};

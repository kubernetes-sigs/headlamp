#!/usr/bin/env node
/**
 * Script to update copyright years in license headers across the codebase.
 * This script replaces hardcoded years with the current year.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Configuration
// Using only the current year for copyright notices
const currentYear = new Date().getFullYear();
const copyrightYearText = currentYear.toString();

// Directories to scan
const SOURCE_DIRS = [
  'frontend/src',
  'backend',
  'plugins',
  'app'
];

// File extensions to process
const FILE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];

// Directories to ignore
const IGNORE_DIRS = [
  'node_modules',
  'dist',
  'build',
  'coverage',
  'vendor'
];

// Regular expression to match copyright lines
const COPYRIGHT_REGEX = /Copyright\s+(\d{4}(?:-\d{4})?)\s+The Kubernetes Authors/g;

/**
 * Recursively walks a directory and returns all files matching the given extensions
 * @param {string} dir - Directory to walk
 * @param {string[]} extensions - File extensions to include
 * @param {string[]} ignoreDirs - Directories to ignore
 * @returns {string[]} - Array of file paths
 */
function walkDir(dir, extensions, ignoreDirs) {
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        // Skip ignored directories
        if (ignoreDirs.includes(file)) {
          continue;
        }
        // Recursively walk subdirectories
        results = results.concat(walkDir(filePath, extensions, ignoreDirs));
      } else {
        // Check if file has one of the target extensions
        const ext = path.extname(file).toLowerCase();
        if (extensions.includes(ext)) {
          results.push(filePath);
        }
      }
    }
  } catch (error) {
    console.error(`Error walking directory ${dir}:`, error);
  }
  return results;
}

/**
 * Updates the copyright year in a single file
 * @param {string} filePath - Path to the file to update
 * @returns {boolean} - Whether the file was updated
 */
function updateCopyrightInFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    // Replace the copyright year
    content = content.replace(
      COPYRIGHT_REGEX,
      `Copyright ${copyrightYearText} The Kubernetes Authors`
    );
    
    // Only write to the file if changes were made
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Updated copyright year in: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
    return false;
  }
}

/**
 * Main function to update copyright years in all matching files
 * @param {string[]} specificFiles - Optional array of specific files to update
 * @returns {number} - Number of files updated
 */
function updateCopyrightYears(specificFiles = null) {
  console.log(`Updating copyright years to: ${copyrightYearText}`);
  
  let totalFiles = 0;
  let updatedFiles = 0;
  
  // If specific files are provided, only process those
  if (specificFiles && specificFiles.length > 0) {
    totalFiles = specificFiles.length;
    specificFiles.forEach(file => {
      if (updateCopyrightInFile(file)) {
        updatedFiles++;
      }
    });
  } else {
    // Process each source directory
    const baseDir = path.resolve(__dirname, '..');
    
    for (const sourceDir of SOURCE_DIRS) {
      const fullPath = path.join(baseDir, sourceDir);
      try {
        if (fs.existsSync(fullPath)) {
          const files = walkDir(fullPath, FILE_EXTENSIONS, IGNORE_DIRS);
          totalFiles += files.length;
          
          files.forEach(file => {
            if (updateCopyrightInFile(file)) {
              updatedFiles++;
            }
          });
        } else {
          console.warn(`Source directory not found: ${fullPath}`);
        }
      } catch (error) {
        console.error(`Error processing directory ${fullPath}:`, error);
      }
    }
  }
  
  console.log(`\nCopyright update complete!`);
  console.log(`Processed ${totalFiles} files, updated ${updatedFiles} files.`);
  
  return updatedFiles;
}

// Run the script if executed directly
if (require.main === module) {
  updateCopyrightYears();
}

module.exports = { updateCopyrightYears, updateCopyrightInFile };

#!/usr/bin/env node
/**
 * Test script for the copyright year update functionality.
 * Creates a test file with a hardcoded copyright year and verifies it gets updated correctly.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { updateCopyrightInFile } = require('./update-copyright-years');

// Configuration
const currentYear = new Date().getFullYear();
const expectedYearText = currentYear.toString();

/**
 * Creates a temporary test file with a hardcoded copyright year
 * @returns {string} Path to the created test file
 */
function createTestFile() {
  const testDir = path.join(__dirname, 'test');
  const testFile = path.join(testDir, 'test-copyright.js');
  
  // Create test directory if it doesn't exist
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir);
  }
  
  // Create test file with hardcoded copyright year
  const testContent = `/*
 * Copyright 2022 The Kubernetes Authors
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

console.log('This is a test file');
`;

  fs.writeFileSync(testFile, testContent);
  console.log(`Created test file: ${testFile}`);
  
  return testFile;
}

/**
 * Runs the test for copyright year updates
 */
function runTest() {
  console.log('Running copyright update test...');
  
  // Create test file
  const testFile = createTestFile();
  
  // Update the copyright in the test file
  const updated = updateCopyrightInFile(testFile);
  
  // Verify the result
  if (updated) {
    const updatedContent = fs.readFileSync(testFile, 'utf8');
    
    if (updatedContent.includes(`Copyright ${expectedYearText} The Kubernetes Authors`)) {
      console.log('✅ Test PASSED: Copyright year was correctly updated.');
    } else {
      console.log('❌ Test FAILED: Copyright year was not updated correctly.');
      console.log('Updated content:', updatedContent);
    }
  } else {
    console.log('❌ Test FAILED: File was not updated.');
  }
  
  // Clean up
  try {
    fs.unlinkSync(testFile);
    fs.rmdirSync(path.dirname(testFile));
    console.log('Cleaned up test files.');
  } catch (error) {
    console.error('Error cleaning up:', error);
  }
}

// Run the test
runTest();

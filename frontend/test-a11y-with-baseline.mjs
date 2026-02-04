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
 * Baseline-aware wrapper for axe-storybook accessibility testing.
 * 
 * This script runs axe-storybook tests and compares the results against a baseline
 * configuration file (.axe-storybook-baseline.test-a11y.json). It allows known accessibility
 * violations to pass while failing the build if any new violations are detected.
 * 
 * This ensures CI passes with tracked baseline failures but catches any regressions
 * or new accessibility issues introduced by code changes.
 */

import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASELINE_FILE = path.join(__dirname, '.axe-storybook-baseline.test-a11y.json');

// Load baseline
let baseline = { baseline: {} };
if (existsSync(BASELINE_FILE)) {
  try {
    baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
    console.log(`\n📋 Loaded baseline with ${Object.keys(baseline.baseline).length} known failing stories`);
    console.log(`   Baseline allows known failures while catching new violations\n`);
  } catch (error) {
    console.error(`Warning: Could not parse baseline file: ${error.message}`);
  }
}

// Run axe-storybook and capture output
const axeProcess = spawn('npx', [
  'axe-storybook',
  '--build-dir',
  '../docs/development/storybook'
], {
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: true
});

let output = '';
let errorOutput = '';
let currentTest = null;
let currentComponent = null;
let currentStoryName = null;
const testResults = {
  passes: 0,
  failures: [],
  total: 0
};

// Parse output line by line
axeProcess.stdout.on('data', (data) => {
  const text = data.toString();
  output += text;
  process.stdout.write(text); // Also print to console

  // Parse test results from spec output
  const lines = text.split('\n');
  lines.forEach(line => {
    // Detect passed tests
    if (line.includes('✔') || line.includes('✓')) {
      testResults.passes++;
      testResults.total++;
    }
    
    // Detect failed test - format: "  1) Component/Path"
    const failComponentMatch = line.match(/^\s+\d+\)\s+([A-Za-z][\w/]*(?:\/[\w]+)*)\s*$/);
    if (failComponentMatch) {
      currentComponent = failComponentMatch[1];
      currentStoryName = null;
      currentTest = null;
    }
    
    // Detect story name after component - format: "       Story Name:"
    // Story names should not start with common violation detail keywords
    const storyNameMatch = line.match(/^\s{7}([^:]+):\s*$/);
    if (storyNameMatch && currentComponent) {
      const storyName = storyNameMatch[1].trim();
      // Filter out violation details that look like story names
      if (!storyName.includes('summary') && 
          !storyName.includes('Check these nodes') &&
          !storyName.includes('html') &&
          !storyName.includes('Detected')) {
        currentStoryName = storyName;
        currentTest = `${currentComponent}/${currentStoryName}`;
      }
    }
    
    // Detect violation rules - format: "     1. rule-name (description)"
    const violationMatch = line.match(/^\s{5,}\d+\.\s+([a-z-]+)\s+\(/);
    if (violationMatch && currentTest) {
      const rule = violationMatch[1];
      let existing = testResults.failures.find(f => f.story === currentTest);
      if (!existing) {
        existing = { story: currentTest, violations: [] };
        testResults.failures.push(existing);
        testResults.total++;
      }
      if (!existing.violations.includes(rule)) {
        existing.violations.push(rule);
      }
    }
  });
});

axeProcess.stderr.on('data', (data) => {
  errorOutput += data.toString();
  process.stderr.write(data);
});

axeProcess.on('close', (code) => {
  // Analyze results against baseline
  const newFailures = [];
  const knownFailures = [];

  testResults.failures.forEach(failure => {
    const baselineRules = baseline.baseline[failure.story] || [];
    const unexpectedRules = failure.violations.filter(rule => !baselineRules.includes(rule));

    if (unexpectedRules.length > 0) {
      newFailures.push({ story: failure.story, unexpectedRules, allViolations: failure.violations });
    } else {
      knownFailures.push({ story: failure.story, violations: failure.violations });
    }
  });

  // Print summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 ACCESSIBILITY TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`\nTotal stories tested: ${testResults.total}`);
  console.log(`✅ Passing: ${testResults.passes} (${((testResults.passes / testResults.total) * 100).toFixed(1)}%)`);
  console.log(`📋 Known baseline failures: ${knownFailures.length}`);
  console.log(`❌ New failures: ${newFailures.length}`);

  if (knownFailures.length > 0) {
    console.log(`\n✓ ${knownFailures.length} stories have known baseline violations (not blocking CI)`);
    console.log(`  See docs/a11y-issues.md for details on known issues`);
  }

  if (newFailures.length > 0) {
    console.log('\n' + '='.repeat(70));
    console.log('❌ NEW ACCESSIBILITY VIOLATIONS DETECTED');
    console.log('='.repeat(70));
    newFailures.forEach(({ story, unexpectedRules, allViolations }) => {
      console.log(`\n📍 Story: ${story}`);
      console.log(`   New violations: ${unexpectedRules.join(', ')}`);
      console.log(`   All violations: ${allViolations.join(', ')}`);
    });
    
    console.log('\n' + '='.repeat(70));
    console.log(`❌ CI FAILED: ${newFailures.length} new accessibility violation(s)`);
    console.log('='.repeat(70));
    console.log('\nTo fix this:');
    console.log('  1. Fix the new accessibility violations in the components');
    console.log('  2. OR if intentional, update frontend/.axe-storybook-baseline.test-a11y.json');
    console.log('  3. Run "npm run frontend:test:a11y" locally to verify\n');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ ALL TESTS PASSED - No new accessibility violations detected');
  console.log('='.repeat(70));
  console.log('');
  process.exit(0);
});

axeProcess.on('error', (error) => {
  console.error('Failed to run axe-storybook:', error);
  process.exit(1);
});

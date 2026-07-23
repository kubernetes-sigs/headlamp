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
import { readFileSync, existsSync, unlinkSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASELINE_FILE = path.join(__dirname, '.axe-storybook-baseline.test-a11y.json');
const REPORT_FILE = path.join(os.tmpdir(), `axe-storybook-${process.pid}.json`);

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

function storyName(test) {
  const prefix = /^\[[^]]+\] accessibility /;
  const component = test.fullTitle.slice(0, -` ${test.title}`.length).replace(prefix, '');
  return `${component}/${test.title}`;
}

function axeRuleIds(message) {
  return [...message.matchAll(/\d+\.\s+([a-z][a-z0-9-]*)\s+\(/gi)].map(match => match[1]);
}

try {
  const axeProcess = spawn('npx', [
    'axe-storybook',
    '--build-dir',
    '../docs/development/storybook',
    '--reporter',
    'json',
    '--reporter-options',
    `output=${REPORT_FILE}`,
  ], {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true,
  });

  const code = await new Promise((resolve, reject) => {
    axeProcess.stdout.on('data', (data) => process.stdout.write(data));
    axeProcess.stderr.on('data', (data) => process.stderr.write(data));
    axeProcess.once('error', reject);
    axeProcess.once('close', code => resolve(code));
  });

  const testResults = JSON.parse(readFileSync(REPORT_FILE, 'utf8'));

  const newFailures = [];
  const knownFailures = [];
  const hardFailures = [];

  testResults.failures.forEach(failure => {
    const currentTest = storyName(failure);
    const violations = axeRuleIds(failure.err?.message || '');
    const baselineRules = baseline.baseline[currentTest] || [];
    const unexpectedRules = violations.filter(rule => !baselineRules.includes(rule));

    if (violations.length === 0) {
      hardFailures.push({ story: currentTest, message: failure.err?.message || 'Unknown test failure' });
    } else if (unexpectedRules.length > 0) {
      newFailures.push({ story: currentTest, unexpectedRules, allViolations: violations });
    } else {
      knownFailures.push({ story: currentTest, violations });
    }
  });

  // Analyze results against baseline
  testResults.total = testResults.passes.length + testResults.failures.length;
  console.log('\n' + '='.repeat(70));
  console.log('📊 ACCESSIBILITY TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`\nTotal stories tested: ${testResults.total}`);
  console.log(`✅ Passing: ${testResults.passes.length}`);
  console.log(`📋 Known baseline failures: ${knownFailures.length}`);
  console.log(`❌ New failures: ${newFailures.length + hardFailures.length}`);

  if (knownFailures.length > 0) {
    console.log(`\n✓ ${knownFailures.length} stories have known baseline violations (not blocking CI)`);
    console.log('  See frontend/.axe-storybook-baseline.test-a11y.json for the current baseline of known issues');
  }

  if (newFailures.length > 0 || hardFailures.length > 0) {
    console.log('\n' + '='.repeat(70));
    console.log('❌ NEW ACCESSIBILITY VIOLATIONS DETECTED');
    console.log('='.repeat(70));
    for (const failure of newFailures) {
      console.log(`\n📍 Story: ${failure.story}`);
      console.log(`   New violations: ${failure.unexpectedRules.join(', ')}`);
      console.log(`   All violations: ${failure.allViolations.join(', ')}`);
    }
    for (const failure of hardFailures) {
      console.log(`\n📍 Story: ${failure.story}`);
      console.log(`   Failure: ${failure.message}`);
    }
    console.log('\n' + '='.repeat(70));
    console.log(`❌ CI FAILED: ${newFailures.length + hardFailures.length} new accessibility violation(s)`);
    console.log('='.repeat(70));
    console.log('\nTo fix this:');
    console.log('  1. Fix the new accessibility violations in the components');
    console.log('  2. OR if intentional, update frontend/.axe-storybook-baseline.test-a11y.json');
    console.log('  3. Run "npm run frontend:test:a11y" locally to verify\n');
  } else {
    console.log('\n' + '='.repeat(70));
    console.log('✅ ALL TESTS PASSED - No new accessibility violations detected');
    console.log('='.repeat(70));
    console.log('');
  }

  const processFailed =
    code !== 0 &&
    (testResults.failures.length === 0 || newFailures.length > 0 || hardFailures.length > 0);
  if (newFailures.length > 0 || hardFailures.length > 0 || processFailed) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`\n❌ Accessibility test runner failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (existsSync(REPORT_FILE)) {
    unlinkSync(REPORT_FILE);
  }
}

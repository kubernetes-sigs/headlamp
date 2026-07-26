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

/*
 * Performance Profiling Analysis Script
 *
 * This script analyzes Chrome DevTools performance profiles to identify bottlenecks
 * in the ResourceMap component.
 *
 * Usage:
 * 1. Open Storybook: npm run frontend:storybook
 * 2. Open Chrome DevTools > Performance tab
 * 3. Start recording
 * 4. Load a performance test story (e.g., PerformanceTest20000Pods)
 * 5. Stop recording
 * 6. Save profile as JSON
 * 7. Run: node analyze-profile.js <profile.json>
 */

const fs = require('fs');

if (process.argv.length < 3) {
  console.log('Usage: node analyze-profile.js <profile.json>');
  console.log('\nHow to capture a profile:');
  console.log('1. npm run frontend:storybook');
  console.log('2. Open Chrome DevTools > Performance tab');
  console.log('3. Click Record, interact with GraphView, click Stop');
  console.log('4. Click "Save profile" button');
  console.log('5. Run this script with the saved JSON file');
  process.exit(1);
}

const profilePath = process.argv[2];

if (!fs.existsSync(profilePath)) {
  console.error(`Error: Profile file not found: ${profilePath}`);
  process.exit(1);
}

console.log('Loading profile:', profilePath);
const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

console.log('\n=== Profile Analysis ===\n');

// Analyze trace events
const events = profile.traceEvents || [];
console.log(`Total trace events: ${events.length}`);

// Find function call events
const functionCalls = events.filter(
  e => e.name === 'FunctionCall' || e.name === 'EvaluateScript' || e.name === 'v8.compile'
);

console.log(`Function calls: ${functionCalls.length}`);

// Find long-running operations
const longOperations = events.filter(e => e.dur && e.dur > 10000); // > 10ms
console.log(`\nOperations > 10ms: ${longOperations.length}`);

if (longOperations.length > 0) {
  console.log('\nTop 20 slowest operations:');
  longOperations
    .sort((a, b) => (b.dur || 0) - (a.dur || 0))
    .slice(0, 20)
    .forEach((e, i) => {
      const durMs = ((e.dur || 0) / 1000).toFixed(2);
      console.log(`${i + 1}. ${e.name} - ${durMs}ms`);
    });
}

// Find ResourceMap related operations
const resourceMapOps = events.filter(
  e =>
    e.name &&
    typeof e.name === 'string' &&
    (e.name.includes('filterGraph') ||
      e.name.includes('groupGraph') ||
      e.name.includes('applyGraphLayout') ||
      e.name.includes('simplifyGraph') ||
      e.name.includes('GraphView') ||
      e.name.includes('graphFiltering') ||
      e.name.includes('graphGrouping'))
);

console.log(`\nResourceMap related operations: ${resourceMapOps.length}`);

// Analyze GC
const gcEvents = events.filter(e => e.name === 'MinorGC' || e.name === 'MajorGC');
console.log(`\nGarbage collection events: ${gcEvents.length}`);

const totalGCTime = gcEvents.reduce((sum, e) => sum + (e.dur || 0), 0) / 1000;
console.log(`Total GC time: ${totalGCTime.toFixed(2)}ms`);

// Analyze layout/paint
const layoutEvents = events.filter(e => e.name === 'Layout');
const paintEvents = events.filter(e => e.name === 'Paint');

console.log(`\nLayout events: ${layoutEvents.length}`);
console.log(`Paint events: ${paintEvents.length}`);

const totalLayoutTime = layoutEvents.reduce((sum, e) => sum + (e.dur || 0), 0) / 1000;
const totalPaintTime = paintEvents.reduce((sum, e) => sum + (e.dur || 0), 0) / 1000;

console.log(`Total layout time: ${totalLayoutTime.toFixed(2)}ms`);
console.log(`Total paint time: ${totalPaintTime.toFixed(2)}ms`);

console.log('\n=== Profiling Instructions ===\n');
console.log('To get more detailed analysis:');
console.log('1. Open the profile in Chrome DevTools');
console.log('2. Look for "Bottom-Up" or "Call Tree" tabs');
console.log('3. Search for: filterGraph, groupGraph, simplifyGraph, applyGraphLayout');
console.log('4. Identify functions with high "Self Time"');
console.log('5. Focus optimization efforts on those functions');
console.log('\nKey metrics to watch:');
console.log('- Self Time: Time spent in function itself (not children)');
console.log('- Total Time: Time including all child function calls');
console.log('- Call Count: Number of times function was called');

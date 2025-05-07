#!/usr/bin/env node
// @ts-check
'use strict';

const fs = require('fs');
const { cliOnlyDependencies, additionalCliDependencies } = require('./cli-dependencies');

// Read the main package.json
const mainPkg = require('./package.json');

// Create minimal package.json with only CLI dependencies
const cliPkg = {
  name: mainPkg.name,
  version: mainPkg.version,
  bin: mainPkg.bin, // Keep original bin field format
  dependencies: {},
};

// Include CLI-only dependencies
for (const dep of cliOnlyDependencies) {
  if (mainPkg.dependencies[dep]) {
    cliPkg.dependencies[dep] = mainPkg.dependencies[dep];
  }
}

// Add additional required runtime dependencies
for (const dep of additionalCliDependencies) {
  if (mainPkg.dependencies[dep]) {
    cliPkg.dependencies[dep] = mainPkg.dependencies[dep];
  }
}

// Write the CLI package.json
if (process.argv[2] === '--check') {
  console.log(JSON.stringify(cliPkg, null, 2));
} else {
  fs.writeFileSync('package.cli.json', JSON.stringify(cliPkg, null, 2));
  console.log('Generated package.cli.json with CLI-only dependencies');
}

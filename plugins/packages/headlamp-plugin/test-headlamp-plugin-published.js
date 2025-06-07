#!/bin/env node

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

const USAGE = `
This tests a published @kinvolk/headlamp-plugin package.

./test-headlamp-plugin-published.js 0.5.2

Assumes being run within the plugins/headlamp-plugin folder
`;

function testHeadlampPluginPublished(pluginVersion) {
  run(`npm install @kinvolk/headlamp-plugin@${pluginVersion}`);

  run('npx @kinvolk/headlamp-plugin create headlamp-myfancy');

  curDir = path.join(tmpDir, 'headlamp-myfancy');
  // test headlamp-plugin build
  run('npm run build');
  checkFileExists(path.join(curDir, 'dist', 'main.js'));

  // test headlamp-plugin build folder
  curDir = tmpDir;
  fs.rmSync(path.join(tmpDir, 'headlamp-myfancy'), { recursive: true });
  run('npx @kinvolk/headlamp-plugin create headlamp-myfancy');
  run('npx @kinvolk/headlamp-plugin build headlamp-myfancy');
  checkFileExists(path.join(curDir, 'headlamp-myfancy', 'dist', 'main.js'));

  // test extraction works
  run('npx @kinvolk/headlamp-plugin extract ./ .plugins');
  checkFileExists(path.join(curDir, '.plugins', 'headlamp-myfancy', 'main.js'));
  // checkFileExists(path.join(curDir, '.plugins', 'headlamp-myfancy', 'package.json'));

  // test format command and that default code is formatted correctly
  fs.rmSync(path.join(tmpDir, 'headlamp-myfancy'), { recursive: true });
  run('npx @kinvolk/headlamp-plugin create headlamp-myfancy');
  curDir = path.join(tmpDir, 'headlamp-myfancy');
  run('npm run format');

  // test lint command and default code is lint free
  run('npm run lint');
  run('npm run lint-fix');

  // test type script error checks
  run('npm run tsc');
}

const fs = require('fs');
const os = require('os');
const child_process = require('child_process');
const path = require('path');
let tmpDir;
let curDir;

function cleanup() {
  console.log(`Cleaning up. Removing temp folder: "${tmpDir}"`);
  fs.rmSync(tmpDir, { recursive: true });
}

function run(cmd) {
  console.log('');
  console.log(`Running cmd:${cmd} inside of cwd:${curDir}`);
  console.log('');
  try {
    child_process.execSync(cmd, {
      stdio: 'inherit',
      cwd: curDir,
      encoding: 'utf8',
    });
  } catch (e) {
    console.error(`Error: Problem running "${cmd}" inside of "${curDir}"`);
    cleanup();
    process.exit(1);
  }
}
function checkFileExists(fname) {
  if (!fs.existsSync(fname)) {
    console.error(`Error: ${fname} does not exist.`);
    cleanup();
    process.exit(1);
  }
}

(function () {
  if (process.argv[1].includes('test-headlamp-plugin-published')) {
    const pluginVersion = process.argv[2];

    if (pluginVersion && process.argv[2] !== '--help') {
      console.log(`Testing pluginVersion: ${pluginVersion}`);
    } else {
      console.log('');
      console.log('pluginVersion as first argument required. Example: 0.5.2');
      console.log(USAGE);
      process.exit(1);
    }

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmp-test-headlamp-plugin'));
    curDir = tmpDir;

    process.on('beforeExit', cleanup);
    testHeadlampPluginPublished(pluginVersion);
  }
})();

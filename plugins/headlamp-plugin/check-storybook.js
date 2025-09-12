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

const { spawn } = require('child_process');
const fs = require('fs');

const packageJsonPath = 'package.json';

// if length of process.argv is not 3, then
if (process.argv.length !== 3) {
  console.error('Usage: node check-storybook.js <plugin-directory>');
  process.exit(1);
}
console.log(process.argv);
// change working directory to the plugin directory in sys.argv 1
process.chdir(process.argv[2]);

// This should first check we are inside a plugin
// Is there a package.json with @kinvolk/headlamp-plugin dependency in it?

if (!fs.existsSync(packageJsonPath)) {
  console.error('No package.json found');
  process.exit(1);
}

// read the package.json
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

if (!packageJson.devDependencies || !packageJson.devDependencies['@kinvolk/headlamp-plugin']) {
  console.error('Not inside a plugin');
  process.exit(1);
}

const storybook = spawn('npm', ['run', 'storybook'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: true,
});

let hasError = false;
function killWithTree(child) {
  if (!child || !child.pid) return;
  if (process.platform === 'win32') {
    // Use taskkill to kill the process tree on Windows
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
  } else {
    try {
      // Kill the process group (negative pid) on POSIX so shell + children are terminated
      process.kill(-child.pid, 'SIGINT');
    } catch (e) {
      // Fallback to killing the child directly
      try {
        child.kill('SIGINT');
      } catch (e2) {}
    }
  }
}

// Listen for errors in stderr
storybook.stderr.on('data', data => {
  const msg = data.toString();
  console.error('[storybook stderr]', msg);
  if (msg.toLowerCase().includes('error')) {
    hasError = true;
  }

  if (msg.includes('[webpack.Progress] 100%')) {
    console.log('Storybook build completed successfully');
    killWithTree(storybook);
    process.exit(0);
  }
});

// Optional: log stdout for debugging
storybook.stdout.on('data', data => {
  console.log('[storybook stdout]', data.toString());
});

// Wait 20 seconds then kill the process
setTimeout(() => {
  console.log('Stopping Storybook after 20 seconds...');
  killWithTree(storybook);

  // Exit with code 0 if no error, 1 if error detected
  process.exit(hasError ? 1 : 0);
}, 20000);

// Handle unexpected exit
storybook.on('exit', code => {
  console.log(`Storybook exited with code ${code}`);
});

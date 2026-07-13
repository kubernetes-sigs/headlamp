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

import { spawn } from 'child_process';
import * as fs from 'fs';

const packageJsonPath = 'package.json';

/**
 * Run Storybook check for a plugin directory.
 * Calls exit(reason) on failure (reason is a string).
 * Calls exit(null) on success.
 *
 * @param {string} pluginDir - Path to plugin directory
 * @param {(reason: string|null|undefined) => void} exit - Callback to call on finish/failure
 * @returns {Promise<void>}
 */
function checkStorybook(pluginDir, exit) {
  return new Promise((resolve) => {
    let exited = false;
    function doExit(reason) {
      if (exited) return;
      exited = true;
      try {
        exit(reason);
      } catch (e) {
        // ignore user callback errors
      }
      resolve();
    }

    if (!pluginDir) {
      console.error('Usage: checkStorybook(pluginDir, exit)');
      doExit('no-plugin-dir');
      return;
    }

    try {
      process.chdir(pluginDir);
    } catch (e) {
      console.error('Failed to change directory:', e.message);
      doExit('chdir-failed');
      return;
    }

    if (!fs.existsSync(packageJsonPath)) {
      console.error('No package.json found');
      doExit('no-package-json');
      return;
    }

    let packageJson;
    try {
      packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    } catch (e) {
      console.error('Failed to read package.json:', e.message);
      doExit('invalid-package-json');
      return;
    }

    if (!packageJson.devDependencies || !packageJson.devDependencies['@kinvolk/headlamp-plugin']) {
      console.error('Not inside a plugin');
      doExit('not-inside-plugin');
      return;
    }

    const storybook = spawn('npm', ['run', 'storybook'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let hasError = false;
    function killWithTree(child) {
      if (!child || !child.pid) return;
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
      } else {
        try {
          process.kill(-child.pid, 'SIGINT');
        } catch (e) {
          try {
            child.kill('SIGINT');
          } catch (e2) {}
        }
      }
    }

    storybook.stderr.on('data', data => {
      const msg = data.toString();
      console.error('[storybook stderr]', msg);
      if (msg.toLowerCase().includes('error')) {
        hasError = true;
      }

      if (msg.includes('[webpack.Progress] 100%')) {
        console.log('Storybook build completed successfully');
        killWithTree(storybook);
        doExit(null); // success
      }
    });

    storybook.stdout.on('data', data => {
      console.log('[storybook stdout]', data.toString());
    });

    // Wait 20 seconds then kill the process and exit (error if errors were seen)
    const timer = setTimeout(() => {
      console.log('Stopping Storybook after 20 seconds...');
      killWithTree(storybook);
      if (hasError) {
        doExit('error-detected');
      } else {
        doExit(null);
      }
    }, 20000);

    storybook.on('exit', code => {
      console.log(`Storybook exited with code ${code}`);
      clearTimeout(timer);
      if (!exited) {
        if (hasError || code !== 0) {
          doExit('storybook-exited-with-error');
        } else {
          doExit(null);
        }
      }
    });

    storybook.on('error', (err) => {
      console.error('Failed to spawn storybook:', err.message);
      clearTimeout(timer);
      doExit('spawn-error');
    });
  });
};


await checkStorybook(process.argv[2], (reason) => {
  if (reason) {
    console.error('Storybook check failed:', reason);
    process.exit(1);
  } else {
    console.log('Storybook check passed');
    process.exit(0);
  }
});

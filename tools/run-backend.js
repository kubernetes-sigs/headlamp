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

// Usage: node tools/run-backend.js [headlamp-server arguments...]
//
// Runs the backend built by 'npm run backend:build' and forwards all arguments
// to it. That build writes the extensionless backend/headlamp-server on every
// platform, which Windows cannot execute, so on Windows this first refreshes
// backend/headlamp-server.exe from it.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const BACKEND_DIR = path.join(__dirname, '..', 'backend');

/**
 * Resolves the backend executable to run, staging a .exe copy on Windows.
 *
 * @param {NodeJS.Platform} [platform] - Platform to resolve the executable for.
 * @param {string} [backendDir] - Directory containing the built backend.
 * @returns {string} Path of the executable to spawn.
 */
function backendExecutable(platform = process.platform, backendDir = BACKEND_DIR) {
  const built = path.join(backendDir, 'headlamp-server');
  if (platform !== 'win32') {
    return built;
  }

  const executable = `${built}.exe`;
  const builtStat = fs.statSync(built, { throwIfNoEntry: false });
  if (!builtStat) {
    // 'make backend' already writes headlamp-server.exe on Windows.
    return executable;
  }
  const executableStat = fs.statSync(executable, { throwIfNoEntry: false });
  if (!executableStat || executableStat.mtimeMs < builtStat.mtimeMs) {
    fs.copyFileSync(built, executable);
  }
  return executable;
}

function main() {
  let executable;
  try {
    executable = backendExecutable();
  } catch (error) {
    console.error(`Failed to prepare the Headlamp backend: ${error.message}`);
    process.exit(1);
  }

  const child = spawn(executable, process.argv.slice(2), { stdio: 'inherit' });
  child.on('error', error => {
    console.error(
      `Failed to start ${executable}: ${error.message}\n` +
        "Build it first with 'npm run backend:build'."
    );
    process.exit(1);
  });

  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    process.on(signal, () => child.kill(signal));
  }
  child.on('exit', (code, signal) => {
    process.exit(signal ? 128 + (os.constants.signals[signal] || 0) : code ?? 1);
  });
}

if (require.main === module) {
  main();
}

module.exports = { backendExecutable };

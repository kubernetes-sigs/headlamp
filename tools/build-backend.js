/*
 * Copyright 2026 The Kubernetes Authors
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

// npm already requires Node; Make invokes the same Go driver without Node.
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function main() {
  const bootstrapEnv = {
    ...process.env,
    GOENV: 'off',
    GO111MODULE: 'off',
    GOTOOLCHAIN: 'local',
    GOFLAGS: '',
    GOWORK: 'off',
    CGO_ENABLED: '0',
    GOOS: '',
    GOARCH: '',
    GOEXPERIMENT: '',
    GO386: '',
    GOAMD64: '',
    GOARM: '',
    GOARM64: '',
    GOMIPS: '',
    GOMIPS64: '',
    GOPPC64: '',
    GORISCV64: '',
    GOWASM: '',
    GOFIPS140: 'off',
  };
  const [hostOS, hostArch] = execFileSync('go', ['env', 'GOHOSTOS', 'GOHOSTARCH'], {
    encoding: 'utf8',
    env: bootstrapEnv,
  })
    .trim()
    .split(/\s+/);
  const tool = path.join(
    __dirname,
    '..',
    'backend',
    '.build',
    `backend-build-${hostOS}-${hostArch}-${process.pid}${hostOS === 'windows' ? '.exe' : ''}`
  );
  if (!hostOS || !hostArch) {
    throw new Error('Go did not report the bootstrap host OS and architecture');
  }
  process.once('exit', () => {
    try {
      fs.rmSync(tool, { force: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to remove backend build bootstrap ${tool}: ${message}`);
      if (!process.exitCode) process.exitCode = 1;
    }
  });
  // Always rebuild through Go's cache, including after Go or source changes.
  execFileSync('go', ['build', '-o', tool, path.join(__dirname, 'build-backend.go')], {
    stdio: 'inherit',
    env: { ...bootstrapEnv, GOOS: hostOS, GOARCH: hostArch },
  });

  const child = spawn(tool, process.argv.slice(2), { stdio: 'inherit', env: process.env });
  child.on('error', error => {
    console.error(`Failed to build the backend: ${error.message}`);
    process.exit(1);
  });
  /** @type {NodeJS.Signals[]} */
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'];
  for (const signal of signals) {
    process.on(signal, () => {
      // Attached Windows children receive console events directly.
      if (process.platform !== 'win32') child.kill(signal);
    });
  }
  child.on('exit', (code, signal) => {
    process.exit(signal ? 128 + (os.constants.signals[signal] || 0) : code ?? 1);
  });
}

if (require.main === module) {
  main();
}

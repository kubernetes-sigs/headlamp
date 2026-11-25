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

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { mergeCoverage } = require('./coverage');

const appRoot = path.resolve(__dirname, '..');
const e2eRoot = path.join(appRoot, 'e2e-tests');
const output = path.join(appRoot, 'coverage');
const rawDirectory = path.join(output, 'e2e');
const npmCli = process.env.npm_execpath;
let activeChild;
let interrupted;
let restoring = false;
const signals =
  process.platform === 'win32'
    ? ['SIGINT', 'SIGTERM', 'SIGBREAK']
    : ['SIGINT', 'SIGTERM', 'SIGHUP'];
const handlers = signals.map(signal => {
  const handler = () => {
    interrupted = signal;
    if (activeChild && !restoring && process.platform !== 'win32') activeChild.kill(signal);
  };
  process.on(signal, handler);
  return [signal, handler];
});

function run(args, cwd = appRoot, env = process.env) {
  if (interrupted && !restoring) {
    throw new Error(`Desktop coverage interrupted by ${interrupted}.`);
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit' });
    activeChild = child;
    child.once('error', reject);
    child.once('close', (status, signal) => {
      activeChild = undefined;
      if (signal) reject(new Error(`Desktop coverage command terminated by ${signal}.`));
      else if (status === null)
        reject(new Error('Desktop coverage command returned no exit status.'));
      else resolve(status);
    });
  });
}

async function main() {
  if (!npmCli) throw new Error('Run desktop coverage through npm run app:test:coverage.');
  const playwright = require.resolve('@playwright/test/cli', { paths: [e2eRoot] });
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(rawDirectory, { recursive: true });

  const unitStatus = await run([
    npmCli,
    'test',
    '--',
    '--coverage',
    '--coverage.provider=istanbul',
    '--coverage.include=electron/**/*.{ts,js}',
    '--coverage.exclude=**/*.test.{ts,js}',
    '--coverage.exclude=**/*.d.ts',
    '--coverage.reporter=json',
    `--coverage.reportsDirectory=${path.join(output, 'unit')}`,
  ]);
  if (unitStatus !== 0) return unitStatus;

  const buildScript = path.join(__dirname, 'build-electron.js');
  const env = {
    ...process.env,
    HEADLAMP_E2E_COVERAGE_DIR: rawDirectory,
    PLAYWRIGHT_TEST_MODE: 'app',
  };
  let summary;
  try {
    const buildStatus = await run([buildScript, '--dev', '--coverage'], appRoot, env);
    if (buildStatus !== 0) return buildStatus;
    const e2eStatus = await run(
      [playwright, 'test', '--config=playwright.electron.config.ts', ...process.argv.slice(2)],
      e2eRoot,
      env
    );
    if (e2eStatus !== 0) return e2eStatus;
    summary = await mergeCoverage(
      path.join(output, 'unit/coverage-final.json'),
      rawDirectory,
      path.join(output, 'combined')
    );
    if (interrupted) throw new Error(`Desktop coverage interrupted by ${interrupted}.`);
  } finally {
    restoring = true;
    const status = await run([buildScript, '--dev']);
    if (status !== 0) throw new Error('Failed to restore the normal Electron development build.');
    if (interrupted) throw new Error(`Desktop coverage interrupted by ${interrupted}.`);
  }
  const { covered, total, pct } = summary.statements;
  console.log(`Electron runtime statement coverage: ${pct}% (${covered}/${total})`);
  console.log(`HTML report: ${path.join(output, 'combined/index.html')}`);
  return 0;
}

main()
  .then(status => {
    process.exitCode = status;
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  });

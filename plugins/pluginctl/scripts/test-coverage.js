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

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'coverage');
const raw = path.join(output, 'raw');
const nyc = require.resolve('nyc/bin/nyc.js');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pluginctl-coverage-'));

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary },
  });
  if (result.error) throw result.error;
  if (result.signal || result.status === null)
    throw new Error('Coverage command terminated without an exit code.');
  if (result.status !== 0)
    throw new Error(`Coverage command failed with exit code ${result.status}.`);
}

try {
  fs.rmSync(output, { recursive: true, force: true });
  run([
    require.resolve('jest/bin/jest'),
    '--runInBand',
    '--coverage',
    '--collectCoverageFrom={index.js,bin/**/*.js,src/**/*.js}',
    '--collectCoverageFrom=!src/**/*.test.js',
    '--collectCoverageFrom=!src/**/*.e2e.js',
    '--coverageReporters=json',
    `--coverageDirectory=${path.join(output, 'unit')}`,
  ]);
  run([
    nyc,
    '--silent',
    `--temp-dir=${raw}`,
    process.execPath,
    '--test',
    'test/cli.integration.js',
  ]);
  // Keep the existing live Artifact Hub integration in the combined report.
  run([
    nyc,
    '--silent',
    '--clean=false',
    `--temp-dir=${raw}`,
    process.execPath,
    'src/plugin-management.e2e.js',
  ]);
  fs.copyFileSync(
    path.join(output, 'unit/coverage-final.json'),
    path.join(raw, 'unit.json')
  );
  run([
    nyc,
    'report',
    `--temp-dir=${raw}`,
    `--report-dir=${output}`,
    '--reporter=json',
    '--reporter=json-summary',
    '--reporter=html',
    '--reporter=text-summary',
  ]);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 3 });
}

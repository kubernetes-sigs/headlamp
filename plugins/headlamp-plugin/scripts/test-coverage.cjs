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
const { spawnSync } = require('node:child_process');
const { createCoverageMap } = require('istanbul-lib-coverage');
const { createInstrumenter } = require('istanbul-lib-instrument');
const { createContext } = require('istanbul-lib-report');
const reports = require('istanbul-reports');
const { source, root } = require('../test/helpers/source.cjs');
const scopes = require('../test/helpers/coverage-scopes.cjs');
const output = path.join(root, 'coverage');
const raw = path.join(output, 'raw');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(raw, { recursive: true });
const files = [
  'typescript.test.js',
  'test-upgrade.js',
  ...fs
    .readdirSync(path.join(root, 'test'))
    .filter(file => file.endsWith('.test.cjs'))
    .map(file => `test/${file}`),
];
const hook = path.join(root, 'test/helpers/coverage-hook.cjs');
const result = spawnSync(
  process.execPath,
  ['--require', hook, '--test', '--test-concurrency=1', ...files],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      SDK_COVERAGE_DIRECTORY: raw,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require=${JSON.stringify(hook)}`,
    },
  }
);
if (result.error) throw result.error;
if (result.signal || result.status !== 0) {
  console.error('SDK coverage tests did not complete successfully.');
  process.exitCode = 1;
} else {
  const coverage = createCoverageMap({});
  for (const relative of Object.values(scopes).flat()) {
    const { code, filename } = source(relative);
    const instrumenter = createInstrumenter({
      esModules: true,
      parserPlugins: ['typescript', 'jsx'],
    });
    instrumenter.instrumentSync(code, filename);
    coverage.addFileCoverage(instrumenter.lastFileCoverage());
  }
  const expected = new Set(coverage.files());
  for (const file of fs.readdirSync(raw)) {
    const data = createCoverageMap(JSON.parse(fs.readFileSync(path.join(raw, file), 'utf8')));
    data.filter(file => expected.has(file));
    coverage.merge(data);
  }
  const context = createContext({ dir: output, coverageMap: coverage });
  for (const reporter of ['json', 'json-summary', 'html'])
    reports.create(reporter).execute(context);
  const totals = {};
  for (const [name, files] of Object.entries(scopes)) {
    const section = createCoverageMap({});
    for (const file of files)
      section.addFileCoverage(coverage.fileCoverageFor(path.join(root, file)));
    const s = section.getCoverageSummary().statements;
    totals[name] = s;
    console.log(`${name}: ${s.pct}% statements (${s.covered}/${s.total})`);
    if (s.covered * 100 < 80 * s.total) process.exitCode = 1;
  }
  fs.writeFileSync(path.join(output, 'scopes.json'), JSON.stringify(totals, null, 2));
}

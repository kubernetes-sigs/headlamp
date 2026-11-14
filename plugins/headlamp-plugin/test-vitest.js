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

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { normalizeTestConfiguration } = require('./bin/test-config');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp vitest-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, 'first plugin');
  const sdk = path.join(project, 'node_modules', '@kinvolk', 'headlamp-plugin');
  fs.mkdirSync(sdk, { recursive: true });
  fs.cpSync(path.join(__dirname, 'bin'), path.join(sdk, 'bin'), { recursive: true });
  fs.cpSync(path.join(__dirname, 'config'), path.join(sdk, 'config'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'package.json'), path.join(sdk, 'package.json'));
  fs.symlinkSync(path.join(__dirname, 'node_modules'), path.join(sdk, 'node_modules'), 'junction');
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({ name: 'vitest-consumer', version: '0.1.0' })
  );
  return { root, project, cli: path.join(sdk, 'bin', 'headlamp-plugin.js') };
}

function write(project, file, source) {
  const destination = path.join(project, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, source);
}

function configure(project, configuration) {
  const packagePath = path.join(project, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  pkg.headlamp = { test: configuration };
  fs.writeFileSync(packagePath, JSON.stringify(pkg));
}

function run(fixture, args, status = 0, target = fixture.project) {
  const result = spawnSync(process.execPath, [fixture.cli, 'test', target, ...args], {
    cwd: fixture.root,
    env: { ...process.env, CI: 'true', FORCE_COLOR: '0' },
    encoding: 'utf8',
    timeout: 45_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const output = result.stdout + result.stderr;
  assert.equal(result.status, status, output);
  return output;
}

const defaultTest = `import { expect, it } from 'vitest';
it('uses the SDK runner and browser defaults', () => {
  expect(typeof document).toBe('object');
  expect(process.env.UNDER_TEST).toBe('true');
  expect(process.env.PWD).toBe(process.cwd());
});
`;

test('runs the SDK-owned Vitest without a consumer installation or binary', t => {
  const consumer = fixture(t);
  write(consumer.project, 'src/default.test.ts', defaultTest);
  assert.equal(fs.existsSync(path.join(consumer.project, 'node_modules', 'vitest')), false);
  assert.equal(fs.existsSync(path.join(consumer.project, 'node_modules', '.bin')), false);
  run(consumer, ['--run']);
});

test('explicit includes cannot enable dependency-folder tests', t => {
  const consumer = fixture(t);
  configure(consumer.project, { include: ['node_modules/**/*.test.ts'] });
  write(
    consumer.project,
    'node_modules/accidental/should-not-run.test.ts',
    "throw new Error('Dependency tests ran');\n"
  );
  const output = run(consumer, ['--run'], 1);
  assert.match(output, /No test files found/);
  assert.doesNotMatch(output, /Dependency tests ran/);
});

test('SDK defaults always exclude dependencies and repository internals', () => {
  const defaults = normalizeTestConfiguration({});
  assert.deepEqual(defaults.exclude, ['**/node_modules/**', '**/.git/**']);
  assert.equal(defaults.environment, 'dom');
  assert.equal(defaults.watch, undefined);
  assert.deepEqual(normalizeTestConfiguration({ exclude: [] }).exclude, defaults.exclude);
  assert.deepEqual(
    normalizeTestConfiguration({ exclude: ['**/node_modules/**', 'e2e/**'] }).exclude,
    ['**/node_modules/**', '**/.git/**', 'e2e/**']
  );
});

test('excludes node_modules without a caller-supplied flag', t => {
  const consumer = fixture(t);
  write(consumer.project, 'src/default.test.ts', defaultTest);
  write(
    consumer.project,
    'node_modules/accidental/should-not-run.test.ts',
    "throw new Error('Dependency tests ran');\n"
  );
  run(consumer, ['--run']);
});

test('ignores a competing consumer Vitest binary', t => {
  const consumer = fixture(t);
  write(consumer.project, 'src/default.test.ts', defaultTest);
  write(
    consumer.project,
    'node_modules/vitest/package.json',
    JSON.stringify({
      name: 'vitest',
      version: '3.0.0',
      type: 'module',
      exports: { '.': './wrong.mjs', './package.json': './package.json' },
      bin: { vitest: './wrong.mjs' },
    })
  );
  write(
    consumer.project,
    'node_modules/vitest/wrong.mjs',
    "throw new Error('Consumer Vitest must not run');\n"
  );
  write(
    consumer.project,
    process.platform === 'win32' ? 'node_modules/.bin/vitest.cmd' : 'node_modules/.bin/vitest',
    process.platform === 'win32'
      ? '@echo off\r\nexit /b 88\r\n'
      : '#!/usr/bin/env node\nprocess.exit(88);\n'
  );
  if (process.platform !== 'win32') {
    fs.chmodSync(path.join(consumer.project, 'node_modules', '.bin', 'vitest'), 0o755);
  }
  run(consumer, ['--run']);
});

test('supports AI Assistant-style test scoping through SDK options', t => {
  const consumer = fixture(t);
  write(consumer.project, 'src/default.test.ts', defaultTest);
  write(
    consumer.project,
    'packages/shared/shared.test.ts',
    "throw new Error('Shared tests ran');\n"
  );
  write(consumer.project, 'e2e/browser.spec.ts', "throw new Error('Browser tests ran');\n");
  run(consumer, ['--run', '--exclude', '**/packages/**', '--exclude', 'e2e/**']);
});

test('uses portable package settings and appends SDK exclude options', t => {
  const consumer = fixture(t);
  configure(consumer.project, {
    include: ['unit tests/**/*.test.ts'],
    exclude: ['unit tests/config-excluded.test.ts'],
    environment: 'node',
    watch: false,
  });
  write(consumer.project, 'src/default.test.ts', "throw new Error('Wrong configuration');\n");
  write(
    consumer.project,
    'unit tests/config-excluded.test.ts',
    "throw new Error('Configured exclusion was lost');\n"
  );
  write(
    consumer.project,
    'unit tests/cli & excluded.test.ts',
    "throw new Error('Excluded test ran');\n"
  );
  write(
    consumer.project,
    'unit tests/selected test.test.ts',
    `import { expect, it } from 'vitest';
it('test with spaces & punctuation', () => {
  expect(typeof document).toBe('undefined');
});
`
  );
  const output = run(consumer, ['--exclude', 'unit tests/cli & excluded.test.ts']);
  assert.match(output, /--run/);
});

test('run-once CLI mode overrides configured watch mode', t => {
  const consumer = fixture(t);
  configure(consumer.project, { watch: true });
  write(consumer.project, 'src/default.test.ts', defaultTest);
  assert.match(run(consumer, ['--run']), /--run/);
  assert.match(run(consumer, ['--no-watch']), /--run/);
});

test('runs each package in a folder using the SDK configuration', t => {
  const consumer = fixture(t);
  write(consumer.project, 'src/default.test.ts', defaultTest);
  const second = path.join(consumer.root, 'second plugin');
  write(second, 'package.json', JSON.stringify({ name: 'second-consumer', version: '0.1.0' }));
  fs.mkdirSync(path.join(second, 'node_modules'));
  write(second, 'src/default.test.ts', defaultTest);
  run(consumer, ['--run'], 0, consumer.root);
});

test('uses each package configuration without leaking settings between packages', t => {
  const consumer = fixture(t);
  configure(consumer.project, { include: ['unit/*.test.ts'], environment: 'node' });
  write(
    consumer.project,
    'unit/config.test.ts',
    "import { expect, it } from 'vitest';\nit('uses its own config', () => expect(typeof document).toBe('undefined'));\n"
  );
  const second = path.join(consumer.root, 'second plugin');
  write(second, 'package.json', JSON.stringify({ name: 'second-consumer', version: '0.1.0' }));
  fs.mkdirSync(path.join(second, 'node_modules'));
  configure(second, { include: ['unit/*.test.ts'], environment: 'dom' });
  write(
    second,
    'unit/config.test.ts',
    "import { expect, it } from 'vitest';\nit('uses its own config', () => expect(typeof document).toBe('object'));\n"
  );
  run(consumer, ['--run'], 0, consumer.root);
});

test('propagates failed tests and rejects runner-specific options', t => {
  const consumer = fixture(t);
  write(
    consumer.project,
    'src/failing.test.ts',
    `import { expect, it } from 'vitest';\nit('fails', () => expect(true).toBe(false));\n`
  );
  assert.match(run(consumer, ['--run'], 1), /Problem running test/);
  assert.match(run(consumer, ['--config', 'vitest.config.ts'], 1), /Unknown argument/);
  assert.match(run(consumer, ['--', '--reporter=json'], 1), /runner arguments are not supported/);
  assert.match(run(consumer, ['--run', '--watch'], 1), /mutually exclusive/);
});

test('reports malformed package configuration explicitly', t => {
  const consumer = fixture(t);
  write(consumer.project, 'package.json', '{"headlamp":');
  const output = run(consumer, ['--run'], 1);
  assert.match(output, /Cannot parse test configuration/);
  assert.match(output, /package\.json/);
});

for (const configuration of [
  null,
  { include: 'src/**' },
  { include: [''] },
  { exclude: [1] },
  { environment: 'jsdom' },
  { watch: 'yes' },
  { setupFiles: ['vitest.setup.ts'] },
]) {
  test(`rejects invalid or runner-specific configuration ${JSON.stringify(configuration)}`, t => {
    const consumer = fixture(t);
    configure(consumer.project, configuration);
    const output = run(consumer, ['--run'], 1);
    assert.match(output, /headlamp\.test/);
    assert.match(output, /Problem running test/);
  });
}

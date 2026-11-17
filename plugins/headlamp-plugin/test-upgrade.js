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

const cliPath = path.join(__dirname, 'bin', 'headlamp-plugin.js');
const template = require('./template/package.json');
const source = 'export const unchanged = true;\n';

function legacyPlugin(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-plugin-upgrade-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  fs.mkdirSync(path.join(folder, 'src'));
  fs.writeFileSync(path.join(folder, 'src', 'index.tsx'), source);
  fs.writeFileSync(
    path.join(folder, 'package.json'),
    JSON.stringify({
      name: 'upgrade-regression',
      version: '0.1.0',
      scripts: {
        tsc: 'legacy-tsc',
        storybook: 'legacy-storybook',
        'storybook-build': 'legacy-storybook-build',
        test: 'legacy-test',
        i18n: 'legacy-i18n',
        custom: 'echo keep-me',
      },
      devDependencies: { '@kinvolk/headlamp-plugin': '^0.14.0' },
      overrides: {
        typescript: '5.6.2',
        vitest: '^3.0.5',
        '@vitest/coverage-istanbul': '^3.0.5',
        'webpack-dev-middleware': '^6.1.2',
      },
    })
  );
  return folder;
}

function upgradeConfiguration(folder) {
  const result = spawnSync(
    process.execPath,
    [cliPath, 'upgrade', folder, '--skip-package-updates'],
    {
      encoding: 'utf8',
      timeout: 30_000,
    }
  );
  if (result.error) {
    throw result.error;
  }
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

test('upgrade migrates legacy scripts and tooling overrides to the current template', t => {
  const folder = legacyPlugin(t);
  upgradeConfiguration(folder);
  const upgraded = JSON.parse(fs.readFileSync(path.join(folder, 'package.json'), 'utf8'));

  assert.deepEqual(upgraded.overrides, template.overrides);
  for (const script of ['tsc', 'storybook', 'storybook-build', 'test', 'i18n']) {
    assert.equal(upgraded.scripts[script], template.scripts[script]);
  }
  assert.equal(upgraded.scripts.custom, 'echo keep-me');
  assert.deepEqual(upgraded.eslintConfig, template.eslintConfig);
  assert.equal(upgraded.prettier, template.prettier);
  assert.equal(upgraded.devDependencies['@kinvolk/headlamp-plugin'], '^0.14.0');
});

test('upgrade restores template files without changing source or custom Storybook configuration', t => {
  const folder = legacyPlugin(t);
  const customConfig = 'module.exports = { stories: ["../src/**/*.stories.tsx"] };\n';
  fs.mkdirSync(path.join(folder, '.storybook'));
  fs.writeFileSync(path.join(folder, '.storybook', 'main.cjs'), customConfig);
  fs.writeFileSync(
    path.join(folder, 'tsconfig.json'),
    '{"compilerOptions":{"moduleResolution":"node"}}'
  );
  upgradeConfiguration(folder);

  for (const file of ['tsconfig.json', path.join('src', 'headlamp-plugin.d.ts')]) {
    assert.equal(
      fs.readFileSync(path.join(folder, file), 'utf8'),
      fs.readFileSync(path.join(__dirname, 'template', file), 'utf8')
    );
  }
  assert.equal(fs.readFileSync(path.join(folder, 'src', 'index.tsx'), 'utf8'), source);
  assert.equal(fs.readFileSync(path.join(folder, '.storybook', 'main.cjs'), 'utf8'), customConfig);
});

test('upgrade configuration is idempotent', t => {
  const folder = legacyPlugin(t);
  upgradeConfiguration(folder);
  const first = fs.readFileSync(path.join(folder, 'package.json'), 'utf8');
  upgradeConfiguration(folder);
  assert.equal(fs.readFileSync(path.join(folder, 'package.json'), 'utf8'), first);
});

test('upgrade preserves SDK-owned test settings while restoring the managed test command', t => {
  const folder = legacyPlugin(t);
  const packagePath = path.join(folder, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const configuration = {
    include: ['src/**/*.test.ts'],
    exclude: ['packages/**', 'e2e/**'],
    environment: 'dom',
    watch: false,
  };
  pkg.headlamp = { test: configuration };
  fs.writeFileSync(packagePath, JSON.stringify(pkg));
  upgradeConfiguration(folder);
  const upgraded = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  assert.deepEqual(upgraded.headlamp.test, configuration);
  assert.equal(upgraded.scripts.test, template.scripts.test);
});

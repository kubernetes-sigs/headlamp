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
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const {
  getNativeTypeScriptCommand,
  getUpgradeOverrides,
  usesNativeTypeScript,
} = require('./bin/typescript');

function fixture(t, packageJson = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-typescript-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(packageJson));
  fs.mkdirSync(path.join(directory, 'node_modules'));
  return directory;
}

function installNative(directory, metadata = {}) {
  const installed = path.join(directory, 'node_modules', '@typescript', 'native');
  fs.mkdirSync(path.join(installed, 'bin'), { recursive: true });
  fs.writeFileSync(
    path.join(installed, 'package.json'),
    JSON.stringify({ name: 'typescript', version: '7.0.2', bin: { tsc: 'bin/tsc' }, ...metadata })
  );
  fs.writeFileSync(
    path.join(installed, 'bin', 'tsc'),
    'console.log(JSON.stringify(process.argv.slice(2)));'
  );
  return installed;
}

const nativeDependency = { '@typescript/native': 'npm:typescript@^7.0.2' };

const templateOverrides = { typescript: '5.6.2', vitest: '^5.0.4' };

test('default upgrades retain the full template overrides', () => {
  assert.deepEqual(getUpgradeOverrides({}, templateOverrides), {
    typescript: '5.6.2',
    vitest: '^5.0.4',
  });
});

for (const section of ['dependencies', 'devDependencies']) {
  test(`native upgrades with ${section} omit only the TypeScript template override`, () => {
    const packageJson = { [section]: nativeDependency, overrides: { custom: '1.0.0' } };
    const result = getUpgradeOverrides(packageJson, templateOverrides);
    assert.deepEqual(result, { vitest: '^5.0.4' });
    assert.deepEqual(templateOverrides, { typescript: '5.6.2', vitest: '^5.0.4' });
    assert.deepEqual(
      getUpgradeOverrides({ ...packageJson, overrides: result }, templateOverrides),
      {
        vitest: '^5.0.4',
      }
    );
    assert.deepEqual(packageJson[section], nativeDependency);
  });
}

test('default projects leave binary lookup unchanged', t => {
  const directory = fixture(t, { devDependencies: { typescript: '5.6.2' } });
  assert.equal(getNativeTypeScriptCommand(directory), undefined);
  assert.equal(usesNativeTypeScript({}), false);
  assert.equal(usesNativeTypeScript({ optionalDependencies: nativeDependency }), false);
});

for (const section of ['dependencies', 'devDependencies']) {
  test(`recognizes native compiler in ${section}`, t => {
    const directory = fixture(t, { [section]: nativeDependency });
    const installed = installNative(directory);
    assert.equal(usesNativeTypeScript({ [section]: nativeDependency }), true);
    assert.deepEqual(getNativeTypeScriptCommand(directory), {
      file: process.execPath,
      args: [path.join(installed, 'bin', 'tsc'), '--noEmit'],
    });
  });
}

test('uses project native bin rather than a competing legacy .bin', t => {
  const directory = fixture(t, { devDependencies: nativeDependency });
  const installed = installNative(directory);
  fs.mkdirSync(path.join(directory, 'node_modules', '.bin'));
  fs.writeFileSync(
    path.join(directory, 'node_modules', '.bin', 'tsc'),
    'throw new Error("legacy");'
  );
  const { file, args } = getNativeTypeScriptCommand(directory);
  assert.equal(args[0], path.join(installed, 'bin', 'tsc'));
  assert.equal(execFileSync(file, args, { encoding: 'utf8' }).trim(), '["--noEmit"]');
});

test('resolves workspace-hoisted native package from the target project', t => {
  const workspace = fixture(t);
  const installed = installNative(workspace);
  const project = path.join(workspace, 'packages', 'plugin');
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({ dependencies: nativeDependency })
  );
  assert.equal(getNativeTypeScriptCommand(project).args[0], path.join(installed, 'bin', 'tsc'));
});

test('rejects a missing native package despite an installed legacy bin', t => {
  const directory = fixture(t, { devDependencies: nativeDependency });
  fs.mkdirSync(path.join(directory, 'node_modules', '.bin'));
  fs.writeFileSync(path.join(directory, 'node_modules', '.bin', 'tsc'), 'process.exit(0);');
  assert.throws(
    () => getNativeTypeScriptCommand(directory),
    error =>
      error.message.includes(directory) &&
      /@typescript\/native/.test(error.message) &&
      /npm install/.test(error.message)
  );
});

for (const version of ['5.6.2', '6.0.3', '7.1.0-beta', '8.0.0', 'not-a-version']) {
  test(`rejects unsupported native compiler version ${version}`, t => {
    const directory = fixture(t, { dependencies: nativeDependency });
    installNative(directory, { version });
    assert.throws(() => getNativeTypeScriptCommand(directory), /stable TypeScript 7/);
  });
}

test('rejects a missing compiler bin without falling back', t => {
  const directory = fixture(t, { dependencies: nativeDependency });
  const installed = installNative(directory);
  fs.unlinkSync(path.join(installed, 'bin', 'tsc'));
  assert.throws(() => getNativeTypeScriptCommand(directory), /npm install/);
});

test('rejects a package without a tsc bin', t => {
  const directory = fixture(t, { dependencies: nativeDependency });
  installNative(directory, { bin: {} });
  assert.throws(() => getNativeTypeScriptCommand(directory), /tsc/);
});

test('folder invocation succeeds after all target compilers succeed', t => {
  const root = fixture(t);
  fs.unlinkSync(path.join(root, 'package.json'));
  for (const name of ['first', 'second']) {
    const directory = path.join(root, name);
    fs.mkdirSync(directory);
    fs.writeFileSync(
      path.join(directory, 'package.json'),
      JSON.stringify({ dependencies: nativeDependency })
    );
    installNative(directory);
  }
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, 'bin', 'headlamp-plugin.js'), 'tsc', root],
    {
      encoding: 'utf8',
    }
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('keeps compiler paths containing spaces as one argument', t => {
  const root = fixture(t);
  const directory = path.join(root, 'parent with spaces', 'plugin');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({ dependencies: nativeDependency })
  );
  installNative(directory);
  const { file, args } = getNativeTypeScriptCommand(directory);
  assert.equal(execFileSync(file, args, { encoding: 'utf8' }).trim(), '["--noEmit"]');
});

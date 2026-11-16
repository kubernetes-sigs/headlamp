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
const { createRequire } = require('node:module');
const os = require('node:os');
const path = require('node:path');
const semver = require('semver');

const toolingDirectory = __dirname;
const sourceCli = path.join(toolingDirectory, 'bin', 'headlamp-plugin.js');

function run(cwd, command, args, expectedError) {
  console.log(`\n${cwd}: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, CI: 'true' },
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const output = (result.stdout || '') + (result.stderr || '');
  if (expectedError) {
    assert.notEqual(result.status, 0, 'Expected the invalid fixture to fail');
    assert.match(output, expectedError);
  } else {
    if (result.status !== 0) console.error(output);
    assert.equal(result.status, 0, `Command failed: ${command} ${args.join(' ')}`);
  }
  console.log(output.slice(-2500));
  return output;
}

function npm(directory, args) {
  // Invoke npm through Node to avoid shell quoting and platform-specific shims.
  return run(directory, process.execPath, [
    process.env.npm_execpath || require.resolve('npm/bin/npm-cli.js'),
    ...args,
  ]);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function installedCli(directory) {
  return path.join(
    directory,
    'node_modules',
    '@kinvolk',
    'headlamp-plugin',
    'bin',
    'headlamp-plugin.js'
  );
}

function cli(directory, command, args = [], expectedError) {
  return run(
    directory,
    process.execPath,
    [installedCli(directory), command, ...args],
    expectedError
  );
}

function checkCompilerApis(directory) {
  const projectRequire = createRequire(path.join(directory, 'package.json'));
  const configRequire = createRequire(projectRequire.resolve('@headlamp-k8s/eslint-config'));
  const parserRequire = createRequire(configRequire.resolve('@typescript-eslint/parser'));
  const estreeRequire = createRequire(
    parserRequire.resolve('@typescript-eslint/typescript-estree')
  );
  const parserVersion = configRequire('@typescript-eslint/parser/package.json').version;
  assert.ok(semver.gte(parserVersion, '8.72.0'), `Config loaded parser ${parserVersion}`);
  assert.ok(
    semver.gte(projectRequire('@typescript-eslint/eslint-plugin/package.json').version, '8.72.0')
  );
  const lock = readJson(path.join(directory, 'package-lock.json'));
  const parsers = Object.entries(lock.packages).filter(([key]) =>
    key.endsWith('node_modules/@typescript-eslint/parser')
  );
  assert.ok(parsers.length > 0);
  for (const [, metadata] of parsers) assert.ok(semver.gte(metadata.version, '8.72.0'));

  const toolingRequire = createRequire(
    projectRequire.resolve('@kinvolk/headlamp-plugin/package.json')
  );
  for (const [name, consumerRequire] of [
    ['parser', estreeRequire],
    ...['ts-loader', 'react-docgen-typescript', 'i18next-parser'].map(name => [
      name,
      createRequire(toolingRequire.resolve(name)),
    ]),
  ]) {
    const compiler = consumerRequire('typescript');
    assert.equal(typeof compiler.createSourceFile, 'function', `${name} needs the legacy API`);
    assert.equal(typeof compiler.transpileModule, 'function', `${name} needs the legacy API`);
    assert.ok(semver.satisfies(compiler.version, '>=4.8.4 <6.1.0'));
    console.log(
      `${name}: TypeScript ${compiler.version} at ${consumerRequire.resolve('typescript')}`
    );
  }
}

function addSources(directory) {
  const source = path.join(directory, 'src');
  fs.writeFileSync(
    path.join(source, 'sum.ts'),
    `export function sum(left: number, right: number) {
  return left + right;
}
`
  );
  fs.writeFileSync(
    path.join(source, 'Feature.tsx'),
    `import { useTranslation } from '@kinvolk/headlamp-plugin/lib';

export function Feature() {
  const { t } = useTranslation();
  return <span>{t('Native compiler fixture')}</span>;
}
`
  );
  fs.writeFileSync(
    path.join(source, 'Feature.test.ts'),
    `import { sum } from './sum';

it('adds two values', () => {
  expect(sum(2, 3)).toBe(5);
});
`
  );
  fs.writeFileSync(
    path.join(source, 'Feature.stories.tsx'),
    `import { Feature } from './Feature';

export default { title: 'Compatibility/Feature', component: Feature };
export const Default = {};
`
  );
  fs.appendFileSync(path.join(source, 'index.tsx'), "\nexport { Feature } from './Feature';\n");
}

function coreChecks(directory) {
  npm(directory, ['run', 'lint']);
  npm(directory, ['run', 'tsc']);
  npm(directory, ['run', 'test']);
  npm(directory, ['run', 'build']);
  assert.ok(fs.statSync(path.join(directory, 'dist', 'main.js')).size > 0);
}

function testTypeScriptCompatibility(packedFile) {
  assert.ok(packedFile, 'Pass a locally built headlamp-plugin tarball');
  const tarball = path.resolve(packedFile);
  assert.ok(fs.statSync(tarball).isFile());
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-ts-compat-'));
  try {
    const mixed = path.join(root, 'plugins');
    fs.mkdirSync(mixed);
    const projects = {};
    for (const name of ['native', 'legacy']) {
      run(mixed, process.execPath, [sourceCli, 'create', name, '--noinstall']);
      const directory = path.join(mixed, name);
      projects[name] = directory;
      const packageFile = path.join(directory, 'package.json');
      const packageJson = readJson(packageFile);
      packageJson.devDependencies['@kinvolk/headlamp-plugin'] = `file:${tarball}`;
      if (name === 'native') {
        packageJson.devDependencies['@typescript/native'] = 'npm:typescript@7.0.2';
        packageJson.devDependencies.typescript = 'npm:@typescript/typescript6@6.0.2';
        delete packageJson.overrides.typescript;
      }
      writeJson(packageFile, packageJson);
      fs.unlinkSync(path.join(directory, 'package-lock.json'));
      addSources(directory);
      npm(directory, ['install']);
      fs.rmSync(path.join(directory, 'node_modules'), { recursive: true, force: true });
      npm(directory, ['ci']);
      const installedPackage = readJson(
        path.join(directory, 'node_modules', '@kinvolk', 'headlamp-plugin', 'package.json')
      );
      const parserRange = installedPackage.dependencies['@typescript-eslint/parser'];
      assert.equal(
        typeof parserRange,
        'string',
        'Packed tooling must declare the supported parser floor'
      );
      assert.ok(semver.gte(semver.minVersion(parserRange), '8.72.0'));
      assert.ok(
        !fs.lstatSync(path.dirname(path.dirname(installedCli(directory)))).isSymbolicLink()
      );
      checkCompilerApis(directory);
      npm(directory, ['run', 'format']);
      coreChecks(directory);
    }

    const native = projects.native;
    const nativeRequire = createRequire(path.join(native, 'package.json'));
    const { getNativeTypeScriptCommand } = nativeRequire('@kinvolk/headlamp-plugin/bin/typescript');
    const compiler = getNativeTypeScriptCommand(native);
    assert.match(run(native, compiler.file, [compiler.args[0], '--version']), /Version 7\.0\.2/);
    assert.ok(
      cli(native, 'tsc').includes(compiler.args[0]),
      'CLI must select the native package bin'
    );
    const legacyRequire = createRequire(path.join(projects.legacy, 'package.json'));
    assert.equal(legacyRequire('typescript').version, '5.6.2');

    const invalid = path.join(native, 'src', 'invalid.ts');
    fs.writeFileSync(invalid, "export const invalid: number = 'not a number';\n");
    cli(native, 'tsc', [], /invalid\.ts.*TS2322/);
    fs.unlinkSync(invalid);
    fs.writeFileSync(invalid, "import { Feature } from './Feature';\n");
    cli(native, 'lint', [], /unused-imports\/no-unused-imports/);
    fs.unlinkSync(invalid);
    npm(native, ['run', 'lint']);
    npm(native, ['run', 'tsc']);

    npm(native, ['run', 'storybook-build']);
    assert.ok(fs.statSync(path.join(native, 'storybook-static', 'index.html')).size > 0);
    npm(native, ['run', 'i18n']);
    const translation = readJson(path.join(native, 'locales', 'en', 'translation.json'));
    assert.equal(translation['Native compiler fixture'], 'Native compiler fixture');

    const nativePackage = path.dirname(nativeRequire.resolve('@typescript/native/package.json'));
    fs.renameSync(nativePackage, nativePackage + '.missing');
    try {
      cli(native, 'tsc', [], /Cannot run @typescript\/native.*npm install/);
    } finally {
      fs.renameSync(nativePackage + '.missing', nativePackage);
    }

    const aliases = readJson(path.join(native, 'package.json')).devDependencies;
    for (const directory of Object.values(projects)) {
      cli(directory, 'upgrade', ['--skip-package-updates']);
      cli(directory, 'upgrade', ['--skip-package-updates']);
      const updated = readJson(path.join(directory, 'package.json'));
      if (directory === native) {
        assert.deepEqual(updated.devDependencies, aliases);
        assert.equal(updated.overrides.typescript, undefined);
      } else {
        assert.equal(updated.overrides.typescript, '5.6.2');
      }
      npm(directory, ['install']);
      npm(directory, ['ci']);
      coreChecks(directory);
    }
    checkCompilerApis(native);

    // The existing upgrade command shell-joins its tarball spec; keep this path space-free.
    const upgradeTarball = path.join(root, 'tooling.tgz');
    fs.copyFileSync(tarball, upgradeTarball);
    cli(native, 'upgrade', ['--headlamp-plugin-version', `file:${upgradeTarball}`]);
    assert.equal(readJson(path.join(native, 'package.json')).overrides.typescript, undefined);
    npm(native, ['ci']);
    coreChecks(native);

    const spacedNative = path.join(mixed, 'native plugin');
    fs.renameSync(native, spacedNative);
    run(root, process.execPath, [installedCli(spacedNative), 'tsc', mixed]);
    run(root, process.execPath, [installedCli(spacedNative), 'tsc', spacedNative]);
    console.log('\nTypeScript 5 baseline and TypeScript 7 opt-in compatibility passed.');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

module.exports = { testTypeScriptCompatibility };

if (require.main === module) {
  testTypeScriptCompatibility(process.argv[2]);
}

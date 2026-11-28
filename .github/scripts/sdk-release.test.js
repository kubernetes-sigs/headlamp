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

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const semver = require('../../tools/releaser/node_modules/semver');
const {
  validate,
  validateAvailability,
  inspectPackage,
  verifyProvenance,
} = require('./sdk-release');

const manifest = {
  name: '@kinvolk/headlamp-plugin',
  version: '0.15.0-alpha.0',
  repository: {
    type: 'git',
    url: 'https://github.com/kubernetes-sigs/headlamp.git',
    directory: 'plugins/headlamp-plugin',
  },
};

test('release selection prevents version mismatches and prerelease promotion to latest', () => {
  validate(manifest, manifest.version, 'alpha');
  validate({ ...manifest, version: '0.15.0' }, '0.15.0', 'latest');
  assert.throws(() => validate(manifest, '0.14.0', 'alpha'), /match committed/);
  assert.throws(() => validate(manifest, manifest.version, 'latest'), /Prereleases/);
  assert.throws(
    () => validate({ ...manifest, version: '0.15.0' }, '0.15.0', 'alpha'),
    /stable releases/
  );
  assert.throws(() => validate(manifest, manifest.version, 'beta'), /Unsupported/);
});

test('release selection requires the correct package and public source repository', () => {
  assert.throws(
    () => validate({ ...manifest, name: 'other' }, manifest.version, 'alpha'),
    /package name/
  );
  assert.throws(
    () => validate({ ...manifest, repository: undefined }, manifest.version, 'alpha'),
    /repository metadata/
  );
  assert.throws(
    () =>
      validate(
        {
          ...manifest,
          repository: { ...manifest.repository, url: 'https://github.com/unrelated/repo.git' },
        },
        manifest.version,
        'alpha'
      ),
    /repository metadata/
  );
});

test('canonical registry preflight rejects existing versions and backward tag movement', () => {
  const metadata = {
    name: manifest.name,
    versions: { '0.14.0': {}, '0.15.0-alpha.1': {} },
    'dist-tags': { latest: '0.14.0', alpha: '0.15.0-alpha.1' },
  };
  validateAvailability(metadata, '0.15.0-alpha.2', 'alpha', semver);
  validateAvailability(metadata, '0.15.0', 'latest', semver);
  assert.throws(
    () => validateAvailability(metadata, '0.14.0', 'latest', semver),
    /already published/
  );
  assert.throws(
    () => validateAvailability(metadata, '0.15.0-alpha.0', 'alpha', semver),
    /move its npm tag backward/
  );
  assert.throws(
    () => validateAvailability(metadata, 'not-a-version', 'alpha', semver),
    /valid semver/
  );
  assert.throws(
    () => validateAvailability({ name: manifest.name }, '0.15.0', 'latest', semver),
    /Incomplete/
  );
});

test('packed release validation checks the actual tarball bytes and metadata', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-sdk-release-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = 'kinvolk-headlamp-plugin-0.15.0-alpha.0.tgz';
  const contents = Buffer.from('release-fixture');
  fs.writeFileSync(path.join(directory, filename), contents);
  const integrity = 'sha512-' + crypto.createHash('sha512').update(contents).digest('base64');
  const record = {
    name: manifest.name,
    version: manifest.version,
    filename,
    integrity,
    files: ['package.json', 'lib/index.js', 'lib/index.d.ts', 'bin/headlamp-plugin.js'].map(
      file => ({ path: file })
    ),
  };
  assert.deepEqual(inspectPackage(manifest, manifest.version, 'alpha', [record], directory), {
    version: manifest.version,
    filename,
    integrity,
  });
  assert.throws(
    () => inspectPackage(manifest, manifest.version, 'alpha', [], directory),
    /exactly one/
  );
  assert.throws(() =>
    inspectPackage(
      manifest,
      manifest.version,
      'alpha',
      [{ ...record, filename: '../foreign.tgz' }],
      directory
    )
  );
  assert.throws(() =>
    inspectPackage(
      manifest,
      manifest.version,
      'alpha',
      [{ ...record, version: '0.14.0' }],
      directory
    )
  );
  assert.throws(
    () =>
      inspectPackage(manifest, manifest.version, 'alpha', [{ ...record, files: [] }], directory),
    /missing package.json/
  );
  fs.appendFileSync(path.join(directory, filename), 'modified');
  assert.throws(
    () => inspectPackage(manifest, manifest.version, 'alpha', [record], directory),
    /integrity mismatch/
  );
});

test('packed release validation accepts a real npm-generated fixture tarball', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-sdk-pack-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const name of ['lib', 'bin']) fs.mkdirSync(path.join(directory, name));
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(directory, 'lib/index.js'), 'module.exports = {};\n');
  fs.writeFileSync(path.join(directory, 'lib/index.d.ts'), 'export {};\n');
  fs.writeFileSync(path.join(directory, 'bin/headlamp-plugin.js'), 'console.log("fixture");\n');
  const result = spawnSync('npm', ['pack', '--json', '--ignore-scripts', '--offline'], {
    cwd: directory,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const records = JSON.parse(result.stdout);
  const inspected = inspectPackage(manifest, manifest.version, 'alpha', records, directory);
  assert.equal(inspected.filename, records[0].filename);
  assert.equal(inspected.integrity, records[0].integrity);
});

test('publish step rejects modified artifacts before invoking npm publish', t => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '../workflows/publish-headlamp-plugin.yml'),
    'utf8'
  );
  const step = workflow
    .split('      - name: Verify artifact and publish through npm trusted publishing\n')[1]
    .split('\n  verify:')[0];
  const script = step.split('        run: |\n')[1].replace(/^          /gm, '');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-publish-fixture-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, 'sdk-release'));
  fs.mkdirSync(path.join(directory, 'bin'));
  const filename = 'fixture.tgz';
  fs.writeFileSync(path.join(directory, 'sdk-release', filename), 'modified');
  fs.writeFileSync(
    path.join(directory, 'bin/npm'),
    '#!/bin/sh\nprintf published > published-marker\n',
    { mode: 0o755 }
  );
  const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
    cwd: directory,
    env: {
      ...process.env,
      PATH: path.join(directory, 'bin') + path.delimiter + process.env.PATH,
      SDK_TARBALL: filename,
      SDK_INTEGRITY: 'sha512-wrong',
      SDK_NPM_TAG: 'alpha',
    },
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /integrity mismatch/);
  assert.equal(fs.existsSync(path.join(directory, 'published-marker')), false);
});

test('verified provenance must identify the exact SDK source and authorized workflow', () => {
  const repository = 'https://github.com/kubernetes-sigs/headlamp';
  const statement = {
    predicate: {
      buildDefinition: {
        externalParameters: {
          workflow: {
            repository,
            ref: 'refs/heads/main',
            path: '.github/workflows/publish-headlamp-plugin.yml',
          },
        },
        resolvedDependencies: [
          { uri: `git+${repository}@refs/heads/main`, digest: { gitCommit: 'expected-commit' } },
        ],
      },
    },
  };
  function report(value) {
    return {
      invalid: [],
      missing: [],
      verified: [
        {
          name: manifest.name,
          version: manifest.version,
          attestationBundles: [
            {
              predicateType: 'https://slsa.dev/provenance/v1',
              bundle: {
                dsseEnvelope: { payload: Buffer.from(JSON.stringify(value)).toString('base64') },
              },
            },
          ],
        },
      ],
    };
  }
  verifyProvenance(report(statement), manifest.version, 'expected-commit');
  assert.throws(
    () => verifyProvenance(report(statement), manifest.version, 'different-commit'),
    /does not identify/
  );
  for (const field of ['repository', 'ref', 'path']) {
    const changed = structuredClone(statement);
    changed.predicate.buildDefinition.externalParameters.workflow[field] = 'unrelated';
    assert.throws(
      () => verifyProvenance(report(changed), manifest.version, 'expected-commit'),
      /does not identify/
    );
  }
  assert.throws(
    () =>
      verifyProvenance({ ...report(statement), verified: [] }, manifest.version, 'expected-commit'),
    /did not report/
  );
  assert.throws(
    () =>
      verifyProvenance(
        { ...report(statement), invalid: [{}] },
        manifest.version,
        'expected-commit'
      ),
    /invalid signatures/
  );
});

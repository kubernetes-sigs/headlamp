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
const path = require('node:path');

const packageName = '@kinvolk/headlamp-plugin';
const repository = 'https://github.com/kubernetes-sigs/headlamp.git';

function validateAvailability(metadata, version, tag, semver) {
  assert.ok(semver.valid(version), 'SDK version must be valid semver');
  assert.equal(metadata.name, packageName, 'Unexpected canonical package metadata');
  assert.ok(metadata.versions && metadata['dist-tags'], 'Incomplete canonical npm metadata');
  assert.ok(!Object.hasOwn(metadata.versions, version), 'SDK version is already published');
  const current = metadata['dist-tags'][tag];
  if (current !== undefined) {
    assert.ok(semver.valid(current), 'Current npm tag must identify a valid semver version');
    assert.ok(semver.gt(version, current), 'Requested SDK version would move its npm tag backward');
  }
}

function validate(manifest, version, tag) {
  assert.equal(manifest.name, packageName, 'Unexpected SDK package name');
  assert.ok(version, 'An exact committed SDK version is required');
  assert.equal(manifest.version, version, 'Requested version must match committed SDK version');
  assert.ok(['alpha', 'latest'].includes(tag), 'Unsupported npm distribution tag');
  assert.equal(
    tag,
    version.includes('-') ? 'alpha' : 'latest',
    'Prereleases must use alpha; stable releases must use latest'
  );
  assert.deepEqual(
    manifest.repository,
    {
      type: 'git',
      url: repository,
      directory: 'plugins/headlamp-plugin',
    },
    'SDK repository metadata must identify its public source'
  );
}

function inspectPackage(manifest, version, tag, records, directory) {
  validate(manifest, version, tag);
  assert.equal(records.length, 1, 'Expected exactly one packed SDK');
  const record = records[0];
  assert.equal(record.name, packageName);
  assert.equal(record.version, version);
  assert.equal(record.filename, `kinvolk-headlamp-plugin-${version}.tgz`);
  const contents = fs.readFileSync(path.join(directory, record.filename));
  const integrity = 'sha512-' + crypto.createHash('sha512').update(contents).digest('base64');
  assert.equal(record.integrity, integrity, 'Packed SDK integrity mismatch');
  for (const required of [
    'package.json',
    'lib/index.js',
    'lib/index.d.ts',
    'bin/headlamp-plugin.js',
  ]) {
    assert.ok(
      record.files.some(file => file.path === required),
      `SDK tarball is missing ${required}`
    );
  }
  return { version, filename: record.filename, integrity };
}

function verifyProvenance(report, version, commit) {
  assert.deepEqual(report.invalid, [], 'npm reported invalid signatures or attestations');
  assert.deepEqual(report.missing, [], 'npm reported missing registry signatures');
  const sdk = report.verified?.find(
    entry => entry.name === packageName && entry.version === version
  );
  assert.ok(sdk, 'npm did not report verified SDK provenance');
  const bundles = sdk.attestationBundles || [];
  const provenance = bundles.filter(
    entry => entry.predicateType === 'https://slsa.dev/provenance/v1'
  );
  assert.ok(provenance.length, 'SDK has no verified SLSA v1 build provenance');
  const expectedRepository = 'https://github.com/kubernetes-sigs/headlamp';
  assert.ok(commit, 'Expected source commit is required');
  assert.ok(
    provenance.some(entry => {
      const statement = JSON.parse(
        Buffer.from(entry.bundle.dsseEnvelope.payload, 'base64').toString('utf8')
      );
      const definition = statement.predicate?.buildDefinition;
      return (
        definition?.externalParameters?.workflow?.repository === expectedRepository &&
        definition.externalParameters.workflow.ref === 'refs/heads/main' &&
        definition.externalParameters.workflow.path ===
          '.github/workflows/publish-headlamp-plugin.yml' &&
        definition.resolvedDependencies?.some(
          dependency =>
            dependency.uri === `git+${expectedRepository}@refs/heads/main` &&
            dependency.digest?.gitCommit === commit
        )
      );
    }),
    'SDK provenance does not identify the expected repository, workflow, ref and source commit'
  );
}

async function main() {
  const manifest = require('../../plugins/headlamp-plugin/package.json');
  const { SDK_VERSION: version, SDK_NPM_TAG: tag } = process.env;
  const mode = process.argv[2];
  if (mode === 'validate') {
    validate(manifest, version, tag);
  } else if (mode === 'preflight') {
    validate(manifest, version, tag);
    const response = await fetch('https://registry.npmjs.org/@kinvolk%2fheadlamp-plugin', {
      signal: AbortSignal.timeout(30000),
    });
    assert.ok(response.ok, `Canonical npm metadata request failed: HTTP ${response.status}`);
    const semver = require('../../plugins/headlamp-plugin/node_modules/semver');
    validateAvailability(await response.json(), version, tag, semver);
  } else if (mode === 'package') {
    const records = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
    const result = inspectPackage(manifest, version, tag, records, process.argv[4]);
    assert.ok(process.env.GITHUB_OUTPUT, 'GITHUB_OUTPUT is required');
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(result)
        .map(([key, value]) => `${key}=${value}\n`)
        .join('')
    );
    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `## SDK publication candidate\n\nSource commit: ${process.env.GITHUB_SHA}\n\n` +
          `Version: ${version}\n\nnpm tag: ${tag}\n\n` +
          `Integrity: \`${result.integrity}\`\n\nPacked file list:\n\n\`\`\`json\n` +
          JSON.stringify(records[0].files, null, 2) +
          '\n```\n'
      );
    }
  } else if (mode === 'verify') {
    verifyProvenance(
      JSON.parse(fs.readFileSync(process.argv[3], 'utf8')),
      version,
      process.env.GITHUB_SHA
    );
  } else {
    throw new Error(
      'Usage: sdk-release.js validate | preflight | package PACK_JSON DIRECTORY | verify AUDIT_JSON'
    );
  }
}

if (require.main === module)
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
module.exports = { validate, validateAvailability, inspectPackage, verifyProvenance };

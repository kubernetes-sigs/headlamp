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
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { verifyArchiveDigest } = require('./src/archive-integrity');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-integrity-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const archive = path.join(directory, 'plugin.tar.gz');
  fs.writeFileSync(archive, 'plugin archive fixture');
  const digest = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  return { archive, digest };
}

function verify(archive, digest) {
  return spawnSync(
    process.execPath,
    [path.join(__dirname, 'src/archive-integrity.js'), archive, digest],
    { encoding: 'utf8' }
  );
}

test('container verifier accepts the pinned archive, including uppercase digests', t => {
  const f = fixture(t);
  const result = verify(f.archive, f.digest.toUpperCase());
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotThrow(() => verifyArchiveDigest(f.archive, f.digest));
});

test('container verifier rejects corrupted content', t => {
  const f = fixture(t);
  fs.appendFileSync(f.archive, 'changed');
  const result = verify(f.archive, f.digest);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SHA-256 mismatch/);
});

test('container verifier requires a valid manifest digest', t => {
  const f = fixture(t);
  for (const digest of ['', 'null', 'not-a-digest']) {
    const result = verify(f.archive, digest);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage:|Invalid SHA-256 digest/);
  }
});

test('legacy desktop manifests can still omit their optional digest', t => {
  const f = fixture(t);
  assert.doesNotThrow(() => verifyArchiveDigest(f.archive));
});

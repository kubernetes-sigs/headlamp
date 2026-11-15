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

'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');

/** @param {string} digest */
function validateDigestFormat(digest) {
  if (!/^[a-f0-9]{64}$/i.test(digest)) {
    throw new Error(`Invalid SHA-256 digest for plugin archive: ${digest}`);
  }
}

/** @param {string} archivePath @param {string} [expectedDigest] */
function verifyArchiveDigest(archivePath, expectedDigest) {
  if (expectedDigest === undefined) {
    return;
  }
  validateDigestFormat(expectedDigest);
  const hash = crypto.createHash('sha256');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  const descriptor = fs.openSync(archivePath, 'r');
  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) {
        hash.update(buffer.subarray(0, bytesRead));
      }
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  const actualDigest = hash.digest('hex');
  if (actualDigest.toLowerCase() !== expectedDigest.toLowerCase()) {
    throw new Error(
      `Plugin archive SHA-256 mismatch: expected ${expectedDigest}, got ${actualDigest}`
    );
  }
}

module.exports = { validateDigestFormat, verifyArchiveDigest };

if (require.main === module) {
  const [archive, digest] = process.argv.slice(2);
  try {
    if (!archive || !digest) {
      throw new Error('Usage: node archive-integrity.js <archive-path> <sha256>');
    }
    validateDigestFormat(digest);
    verifyArchiveDigest(archive, digest);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

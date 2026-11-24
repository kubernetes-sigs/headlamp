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
const childProcess = require('node:child_process');
const { afterEach, test } = require('node:test');

const originalExecSync = childProcess.execSync;

afterEach(() => {
  childProcess.execSync = originalExecSync;
  delete require.cache[require.resolve('./helpers')];
});

function loadHelpersWithExecSync(execSync) {
  childProcess.execSync = execSync;
  delete require.cache[require.resolve('./helpers')];
  return require('./helpers');
}

test('batchApply combines resources into the configured batch size', () => {
  const calls = [];
  const { batchApply } = loadHelpersWithExecSync((command, options) => {
    calls.push({ command, options });
  });

  batchApply(['first', 'second', 'third'], 2);

  assert.equal(calls.length, 2);
  assert.equal(calls[0].command, 'kubectl apply -f -');
  assert.equal(calls[0].options.input, 'first\n---\nsecond');
  assert.equal(calls[1].options.input, 'third');
});

test('batchApply stops and reports kubectl failures', () => {
  const failure = Object.assign(new Error('apply failed'), {
    stderr: Buffer.from('invalid resource'),
  });
  let calls = 0;
  const { batchApply } = loadHelpersWithExecSync(() => {
    calls += 1;
    if (calls === 2) throw failure;
  });

  assert.throws(() => batchApply(['first', 'second', 'third'], 1), failure);
  assert.equal(calls, 2);
});

test('batchApply rejects non-positive and fractional batch sizes', () => {
  const { batchApply } = loadHelpersWithExecSync(() => {
    throw new Error('kubectl should not be called');
  });

  for (const batchSize of [0, -1, 1.5]) {
    assert.throws(
      () => batchApply(['resource'], batchSize),
      new RangeError('batchSize must be a positive integer')
    );
  }
});

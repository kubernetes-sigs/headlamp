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

const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { readFileSync } = require('fs');

const envFile = path.join(os.tmpdir(), 'tmpEnv');

test('Create & verify', () => {
  const execFile = path.resolve(path.join(__dirname, '..', 'make-env.js'));
  execFileSync('node', [execFile, envFile]);

  const envContents = readFileSync(envFile).toString();

  const lines = envContents.split(/\r?\n/);
  const envObj = {};

  lines.forEach(line => {
    // Skip empty lines
    if (!line) {
      return;
    }

    const [key, val] = line.trim().split('=');

    expect(key.trim()).toBeDefined();
    expect(val.trim()).toBeDefined();

    envObj[key] = val;
  });

  const keys = Object.keys(envObj);
  expect(keys).toContain('REACT_APP_HEADLAMP_VERSION');
  expect(keys).toContain('REACT_APP_HEADLAMP_GIT_VERSION');
  expect(keys).toContain('REACT_APP_HEADLAMP_PRODUCT_NAME');
});

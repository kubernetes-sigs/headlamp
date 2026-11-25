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
const test = require('node:test');
const { eventYaml } = require('./create-events');

test('eventYaml creates a DNS-compatible Kubernetes resource name', () => {
  const yaml = eventYaml(12, new Date('2026-07-27T01:02:03.456Z'));
  const name = yaml.match(/^  name: (.+)$/m)?.[1];

  assert.equal(name, 'lorem-event-12-1785114123456');
  assert.match(name, /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/);
});

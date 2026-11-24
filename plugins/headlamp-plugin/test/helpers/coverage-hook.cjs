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

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { randomUUID } = require('node:crypto');
const { source, root } = require('./source.cjs');
const scopes = require('./coverage-scopes.cjs');
const allowed = new Set(
  Object.values(scopes)
    .flat()
    .map(file => path.join(root, file))
);
const original = Module._extensions['.js'];
Module._extensions['.js'] = function (module, filename) {
  if (!allowed.has(filename)) return original(module, filename);
  module._compile(source(path.relative(root, filename), true).code, filename);
};
process.once('exit', () => {
  fs.writeFileSync(
    path.join(process.env.SDK_COVERAGE_DIRECTORY, `${process.pid}-${randomUUID()}.json`),
    JSON.stringify(globalThis.__coverage__ || {})
  );
});

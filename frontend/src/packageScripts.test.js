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

const fs = require('fs');
const path = require('path');

const frontendDirectory = path.resolve(__dirname, '..');
const repositoryDirectory = path.resolve(frontendDirectory, '..');

/**
 * Read a JSON file.
 *
 * @param {string} filePath Path to the JSON file.
 * @returns {object} Parsed JSON value.
 */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('packaged-source scripts use package-owned tsx', () => {
  const rootPackage = readJson(path.join(repositoryDirectory, 'package.json'));
  const frontendPackage = readJson(path.join(frontendDirectory, 'package.json'));
  const dependencySync = fs.readFileSync(
    path.join(repositoryDirectory, 'plugins/headlamp-plugin/dependencies-sync.js'),
    'utf8'
  );

  expect(rootPackage.devDependencies).toHaveProperty('tsx');
  expect(rootPackage.scripts['app:build']).toContain('tsx ./scripts/setup-plugins.ts');
  expect(rootPackage.scripts['app:build:dir']).toContain('tsx ./scripts/setup-plugins.ts');
  expect(rootPackage.scripts['app:start']).toContain('tsx ./scripts/setup-plugins.ts');
  expect(frontendPackage.dependencies).toHaveProperty('tsx');
  expect(frontendPackage.scripts.postbuild).toBe('tsx ./scripts/precompress-build.ts build');
  expect(frontendPackage.scripts['postbuild:rsbuild']).toBe(
    'tsx ./scripts/precompress-build.ts build'
  );
  expect(dependencySync).toMatch(/dependenciesToNotCopy = \[[\s\S]*?'tsx'/);
});

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
  expect(rootPackage.engines.node).toBe('>=22.12.0');
  expect(rootPackage.scripts['app:build']).toContain('tsx ./scripts/setup-plugins.ts');
  expect(rootPackage.scripts['app:build:dir']).toContain('tsx ./scripts/setup-plugins.ts');
  expect(rootPackage.scripts['app:start']).toContain('tsx ./scripts/setup-plugins.ts');
  expect(frontendPackage.dependencies).toHaveProperty('tsx');
  expect(frontendPackage.engines.node).toBe('>=22.12.0');
  expect(frontendPackage.scripts.start).toBe(
    'cross-env REACT_APP_HEADLAMP_BACKEND_TOKEN=headlamp rsbuild dev'
  );
  expect(frontendPackage.scripts['prestart:vite']).toBe('npm run make-version');
  expect(frontendPackage.scripts['start:vite']).toContain('vite');
  expect(frontendPackage.scripts.star).toBe('npm start');
  expect(frontendPackage.scripts.build).toBe(
    'cross-env NODE_OPTIONS=--max-old-space-size=768 rsbuild build'
  );
  expect(frontendPackage.scripts['build:vite']).toContain('vite build');
  expect(frontendPackage.scripts.postbuild).toBe('tsx ./scripts/precompress-build.ts build');
  expect(dependencySync).toMatch(/dependenciesToNotCopy = \[[\s\S]*?'tsx'/);
});

test.each(['/headlamp', '/headlamp/'])(
  'Rsbuild development honors PUBLIC_URL %s',
  async publicUrl => {
    const previousPublicUrl = process.env.PUBLIC_URL;
    process.env.PUBLIC_URL = publicUrl;

    try {
      vi.resetModules();
      const { default: rsbuildConfig } = await import('../rsbuild.config');
      const [httpProxy, webSocketProxy] = rsbuildConfig.server.proxy;

      expect(rsbuildConfig.source.define['import.meta.env.BASE_URL']).toBe(
        JSON.stringify(publicUrl)
      );
      expect(rsbuildConfig.html.templateParameters.BASE_URL).toBe(publicUrl);
      expect(rsbuildConfig.server.base).toBe(publicUrl);
      expect(rsbuildConfig.source.define).not.toHaveProperty('import.meta.env');
      expect(httpProxy.pathFilter).toContain('/headlamp/api');
      expect(httpProxy.pathFilter).not.toContain('/headlamp//api');
      expect(webSocketProxy.pathFilter).toContain('/headlamp/wsMultiplexer');
      expect(webSocketProxy.pathFilter).not.toContain('/headlamp//wsMultiplexer');
    } finally {
      if (previousPublicUrl === undefined) {
        delete process.env.PUBLIC_URL;
      } else {
        process.env.PUBLIC_URL = previousPublicUrl;
      }
      vi.resetModules();
    }
  }
);

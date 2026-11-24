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
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { transformSync } = require('esbuild');
const root = path.resolve(__dirname, '../..');

function source(relative, instrument = false) {
  const filename = path.join(root, relative);
  let code = fs.readFileSync(filename, 'utf8');
  if (instrument) {
    const { createInstrumenter } = require('istanbul-lib-instrument');
    const tool = createInstrumenter({
      esModules: true,
      coverageGlobalScope: 'globalThis',
      coverageGlobalScopeFunc: false,
      parserPlugins: ['typescript', 'jsx'],
    });
    code = tool.instrumentSync(code, filename);
  }
  return { code, filename };
}

function load(relative, options = {}) {
  const { code, filename } = source(relative, !!process.env.SDK_COVERAGE_DIRECTORY);
  const transformed = transformSync(code, {
    loader: relative.endsWith('.tsx') ? 'tsx' : relative.endsWith('.ts') ? 'ts' : 'js',
    jsx: 'automatic',
    format: 'cjs',
    target: 'es2022',
    supported: { 'dynamic-import': false },
    define: {
      'import.meta.url': JSON.stringify(require('node:url').pathToFileURL(filename).href),
      'import.meta.dirname': JSON.stringify(path.dirname(filename)),
      'import.meta.resolve': '__sdkResolve',
    },
  }).code;
  const module = { exports: {} };
  const localRequire = createRequire(filename);
  const mocks = options.mocks || {};
  const requireMock = Object.assign(
    name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith('.') && /\.(?:js|cjs)$/.test(localRequire.resolve(name))) {
        const resolved = localRequire.resolve(name);
        if (
          resolved.startsWith(root + path.sep) &&
          !resolved.includes(`${path.sep}node_modules${path.sep}`)
        ) {
          return load(path.relative(root, resolved), options);
        }
      }
      return localRequire(name);
    },
    { resolve: localRequire.resolve }
  );
  const context = {
    module,
    exports: module.exports,
    require: requireMock,
    __filename: options.filename || filename,
    __dirname: path.dirname(options.filename || filename),
    process: options.process || process,
    console: options.console || console,
    Buffer,
    setTimeout,
    clearTimeout,
    setImmediate,
    URL,
    __sdkResolve: specifier =>
      require('node:url').pathToFileURL(localRequire.resolve(specifier)).href,
    __coverage__: (globalThis.__coverage__ ||= {}),
    ...options.globals,
  };
  vm.runInNewContext(transformed, context, { filename });
  return module.exports;
}

module.exports = { load, source, root };

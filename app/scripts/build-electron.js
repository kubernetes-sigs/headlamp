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

'use strict';

const esbuild = require('esbuild');
const path = require('node:path');
const fs = require('node:fs');

const isWatch = process.argv.includes('--watch');
const isDev = process.argv.includes('--dev');
const isCoverage = process.argv.includes('--coverage');
if (isCoverage && isWatch) {
  throw new Error('Desktop coverage builds do not support watch mode.');
}
// CJS bundling would otherwise inline these dynamic imports into main.js.
// Separate entries keep their module graphs out of startup memory until first use.
const mcpAdapterEntry = path.resolve(__dirname, '../electron/mcp/MCPAdapter.ts');
const buildManifestEntry = path.resolve(__dirname, './build-manifest.ts');
const lazyDependencies = {
  'find-process': './lazy/find-process.js',
  semver: './lazy/semver.js',
  tar: './lazy/tar.js',
};
const mcpAdapterExternalPlugin = {
  name: 'externalize-mcp-adapter',
  setup(build) {
    build.onResolve({ filter: /^\.\/MCPAdapter$/ }, () => ({
      path: './mcp/MCPAdapter.js',
      external: true,
    }));
  },
};
const lazyDependenciesExternalPlugin = {
  name: 'externalize-lazy-dependencies',
  setup(build) {
    build.onResolve({ filter: /^(find-process|semver|tar)$/ }, args => ({
      path: lazyDependencies[args.path],
      external: true,
    }));
  },
};

const commonOptions = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  external: ['electron'],
  format: 'cjs',
  sourcemap: isDev,
  minify: !isDev,
  mainFields: ['main', 'module'],
  logOverride: {
    'empty-import-meta': 'silent',
  },
};

const entryPoints = [
  {
    entryPoints: [path.resolve(__dirname, '../electron/bootstrap.ts')],
    outfile: path.resolve(__dirname, '../build/main.js'),
    plugins: [mcpAdapterExternalPlugin, lazyDependenciesExternalPlugin],
  },
  {
    entryPoints: [path.resolve(__dirname, '../electron/preload.ts')],
    outfile: path.resolve(__dirname, '../build/preload.js'),
  },
  {
    entryPoints: [mcpAdapterEntry],
    outfile: path.resolve(__dirname, '../build/mcp/MCPAdapter.js'),
  },
  {
    entryPoints: [buildManifestEntry],
    format: 'esm',
    outfile: path.resolve(__dirname, '../build/build-manifest.mjs'),
  },
  {
    entryPoints: [require.resolve('find-process')],
    outfile: path.resolve(__dirname, '../build/lazy/find-process.js'),
  },
  {
    entryPoints: [require.resolve('semver')],
    outfile: path.resolve(__dirname, '../build/lazy/semver.js'),
  },
  {
    entryPoints: [path.resolve(__dirname, '../electron/lazy/tar.ts')],
    outfile: path.resolve(__dirname, '../build/lazy/tar.js'),
  },
];

async function build() {
  for (const entry of entryPoints) {
    const options = { ...commonOptions, ...entry };
    if (isCoverage) {
      const { createCoveragePlugin } = require('./coverage');
      options.plugins = [...(options.plugins || []), createCoveragePlugin()];
      options.sourcemap = true;
      options.minify = false;
      const collector =
        entry.outfile === entryPoints[0].outfile
          ? 'main'
          : entry.outfile.endsWith(`${path.sep}preload.js`)
          ? 'preload'
          : undefined;
      if (collector) {
        options.banner = {
          js: fs.readFileSync(path.join(__dirname, `coverage-${collector}.js`), 'utf8'),
        };
      }
    }

    if (isWatch) {
      const ctx = await esbuild.context(options);
      await ctx.watch();
    } else {
      await esbuild.build(options);
    }
  }

  if (isWatch) {
    console.log('Watching for changes...');
  }
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});

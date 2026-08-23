'use strict';

const esbuild = require('esbuild');
const path = require('node:path');

const isWatch = process.argv.includes('--watch');
const isDev = process.argv.includes('--dev');
// CJS bundling would otherwise inline these dynamic imports into main.js.
// Separate entries keep their module graphs out of startup memory until first use.
const mcpAdapterEntry = path.resolve(__dirname, '../electron/mcp/MCPAdapter.ts');
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
    entryPoints: [path.resolve(__dirname, '../electron/main.ts')],
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

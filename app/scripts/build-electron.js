'use strict';

const esbuild = require('esbuild');
const path = require('node:path');

const isWatch = process.argv.includes('--watch');
const isDev = process.argv.includes('--dev');

const commonOptions = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  external: ['electron'],
  format: 'cjs',
  sourcemap: isDev,
  minify: !isDev,
};

const entryPoints = [
  {
    entryPoints: [path.resolve(__dirname, '../electron/main.ts')],
    outfile: path.resolve(__dirname, '../build/main.js'),
  },
  {
    entryPoints: [path.resolve(__dirname, '../electron/preload.ts')],
    outfile: path.resolve(__dirname, '../build/preload.js'),
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

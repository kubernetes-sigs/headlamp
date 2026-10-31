'use strict';

const fs = require('node:fs');
const path = require('node:path');

exports.default = async context => {
  const startedAt = Date.now();
  console.log(`[build-timing] Electron afterPack started at ${new Date(startedAt).toISOString()}`);
  const { loadBuildManifest, verifyPackagedResources } = await import(
    '../build/build-manifest.mjs'
  );
  const resourcesDirectory = context.packager?.getResourcesDir
    ? context.packager.getResourcesDir(context.appOutDir)
    : path.join(context.appOutDir, 'resources');

  if (fs.existsSync('.env')) {
    console.info('Copying .env file to app resources directory!');
    try {
      fs.copyFileSync('.env', path.join(resourcesDirectory, '.env'));
    } catch (err) {
      console.error('Failed to copy .env after pack:', err);
    }
  }

  verifyPackagedResources(resourcesDirectory, loadBuildManifest(), context.electronPlatformName);
  console.log(
    `[build-timing] Electron afterPack completed in ${((Date.now() - startedAt) / 1000).toFixed(
      3
    )}s`
  );
};

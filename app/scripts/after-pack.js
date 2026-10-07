'use strict';

const fs = require('node:fs');
const path = require('node:path');

exports.default = async context => {
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
};

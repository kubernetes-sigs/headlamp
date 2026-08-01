'use strict';

const packageJson = require('./package.json');
const path = require('node:path');
const { DEFAULT_MANIFEST_FILE, resolveBuildManifestPath } = require('./scripts/build-manifest');

const manifestFile = resolveBuildManifestPath();
const defaultManifest = path.resolve(DEFAULT_MANIFEST_FILE);

module.exports = {
  ...packageJson.build,
  extraResources: packageJson.build.extraResources.map(resource => {
    if (path.resolve(__dirname, resource.from) !== defaultManifest) {
      return resource;
    }

    return {
      ...resource,
      from: manifestFile,
      to: 'app-build-manifest.json',
    };
  }),
};

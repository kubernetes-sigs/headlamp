'use strict';

const packageJson = require('./package.json');
const path = require('node:path');
const {
  applyProductMetadata,
  DEFAULT_MANIFEST_FILE,
  loadBuildManifest,
  resolveBuildManifestPath,
} = require('./scripts/build-manifest');

const manifestFile = resolveBuildManifestPath();
const defaultManifest = path.resolve(DEFAULT_MANIFEST_FILE);

const manifest = loadBuildManifest(manifestFile);

module.exports = applyProductMetadata(
  {
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
  },
  manifest
);

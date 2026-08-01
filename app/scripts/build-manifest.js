'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MANIFEST_FILE = path.join(__dirname, '../app-build-manifest.json');

function resolveBuildManifestPath(env = process.env, cwd = process.cwd()) {
  const configuredPath = env.HEADLAMP_BUILD_MANIFEST;
  return configuredPath ? path.resolve(cwd, configuredPath) : DEFAULT_MANIFEST_FILE;
}

function loadBuildManifest(manifestFile = resolveBuildManifestPath()) {
  return JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
}

module.exports = {
  DEFAULT_MANIFEST_FILE,
  loadBuildManifest,
  resolveBuildManifestPath,
};

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

function applyProductMetadata(config, manifest) {
  const product = manifest.product;
  if (product === undefined) {
    return config;
  }
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    throw new Error('Build manifest product must be an object');
  }

  const scalarFields = ['name', 'productName', 'version', 'appId', 'artifactName'];
  for (const field of scalarFields) {
    if (product[field] !== undefined && typeof product[field] !== 'string') {
      throw new Error(`Build manifest product.${field} must be a string`);
    }
  }
  if (
    product.protocols !== undefined &&
    (!product.protocols ||
      typeof product.protocols !== 'object' ||
      Array.isArray(product.protocols))
  ) {
    throw new Error('Build manifest product.protocols must be an object');
  }

  return {
    ...config,
    ...(product.productName && { productName: product.productName }),
    ...(product.appId && { appId: product.appId }),
    ...(product.artifactName && { artifactName: product.artifactName }),
    ...(product.protocols && { protocols: product.protocols }),
    ...(product.version && { buildVersion: product.version }),
    extraMetadata: {
      ...config.extraMetadata,
      ...(product.name && { name: product.name }),
      ...(product.productName && { productName: product.productName }),
      ...(product.version && { version: product.version }),
    },
  };
}

module.exports = {
  applyProductMetadata,
  DEFAULT_MANIFEST_FILE,
  loadBuildManifest,
  resolveBuildManifestPath,
};

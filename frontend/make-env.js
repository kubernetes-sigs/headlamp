/*
 * Copyright 2025 The Kubernetes Authors
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
// Creates the .env file
import { execSync } from 'child_process';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
import path from 'path';

/**
 * Product fields exposed to the frontend build.
 *
 * @typedef {object} ProductInfo
 * @property {string} [productName] Display name for the product.
 * @property {string} [version] Product version shown by the frontend.
 */

const frontendDirectory = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(frontendDirectory, '../app');
const defaultManifestFile = path.join(appDirectory, 'app-build-manifest.json');

/** @type {ProductInfo} */
const appInfo = JSON.parse(fs.readFileSync(path.join(appDirectory, 'package.json'), 'utf8'));

/**
 * Resolves the app build manifest used to generate frontend metadata.
 *
 * @param {NodeJS.ProcessEnv} [env] Environment used to select a custom manifest.
 * @returns {string} Absolute path to the selected or default app build manifest.
 */
function resolveBuildManifestPath(env = process.env) {
  const configuredPath = env.HEADLAMP_BUILD_MANIFEST;
  return configuredPath ? path.resolve(appDirectory, configuredPath) : defaultManifestFile;
}

/**
 * Validates product fields consumed by the frontend build.
 *
 * @param {unknown} manifest Parsed app build manifest.
 * @returns {ProductInfo} Validated product metadata or an empty override.
 * @throws {TypeError} When the manifest, product, or consumed fields have an invalid shape.
 */
function validateProductInfo(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new TypeError('Build manifest must be a JSON object');
  }

  const product = manifest.product;
  if (product === undefined) {
    return {};
  }
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    throw new TypeError('Build manifest product must be an object');
  }
  for (const field of ['productName', 'version']) {
    if (product[field] !== undefined && typeof product[field] !== 'string') {
      throw new TypeError(`Build manifest product.${field} must be a string`);
    }
  }
  return product;
}

/**
 * Reads product metadata from the selected app build manifest.
 *
 * @param {NodeJS.ProcessEnv} [env] Environment used to select a custom manifest.
 * @returns {ProductInfo} Product metadata from the selected manifest, or an empty override when
 * the optional default manifest is absent or has no product metadata.
 * @throws {Error} When the configured manifest cannot be read or parsed as JSON.
 */
function readProductInfo(env = process.env) {
  const manifestPath = resolveBuildManifestPath(env);
  if (!env.HEADLAMP_BUILD_MANIFEST && !fs.existsSync(manifestPath)) {
    return {};
  }
  return validateProductInfo(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
}

/**
 * Resolves the source revision recorded in the frontend environment.
 *
 * @returns {string} The configured source revision, the current Git revision, or
 * `unknown` when Git metadata is unavailable.
 */
function readGitVersion() {
  if (process.env.HEADLAMP_SOURCE_COMMIT) {
    return process.env.HEADLAMP_SOURCE_COMMIT;
  }
  try {
    return execSync('git rev-parse HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
}

const productInfo = readProductInfo();
const productVersion = productInfo.version?.trim();

const envContents = {
  REACT_APP_HEADLAMP_VERSION: appInfo.version,
  REACT_APP_HEADLAMP_GIT_VERSION: readGitVersion(),
  REACT_APP_HEADLAMP_PRODUCT_NAME: productInfo.productName || appInfo.productName,
  ...(productVersion ? { REACT_APP_HEADLAMP_PRODUCT_VERSION: productVersion } : {}),
  REACT_APP_ENABLE_REACT_QUERY_DEVTOOLS: 'false',
  REACT_APP_HEADLAMP_SIDEBAR_DEFAULT_OPEN: 'true',
};

/**
 * Encodes a value for Vite's dotenv parser without variable expansion.
 *
 * The parser preserves quoted `#` characters, while dotenv-expand removes one
 * escaping backslash before each `$`. A quote delimiter absent from the value
 * therefore preserves both characters without changing the decoded value.
 *
 * @param {unknown} value Environment value to encode.
 * @param {string} key Environment key used in validation errors.
 * @returns {string} A dotenv-safe representation of the value.
 * @throws {TypeError} When the value contains newlines or cannot be represented safely.
 */
function serializeEnvValue(value, key) {
  const stringValue = String(value);
  if (/[\r\n]/.test(stringValue)) {
    throw new TypeError(`${key} must not contain newlines`);
  }

  const escapedValue = stringValue.replaceAll('$', '\\$');
  for (const quote of ["'", '`']) {
    if (!stringValue.includes(quote)) {
      return `${quote}${escapedValue}${quote}`;
    }
  }
  if (!stringValue.includes('"') && !/\\[nr]/.test(stringValue)) {
    return `"${escapedValue}"`;
  }
  throw new TypeError(`${key} cannot be represented safely in a dotenv file`);
}

/**
 * Serializes the generated frontend environment as newline-delimited entries.
 *
 * @returns {string} Environment file contents suitable for Vite.
 */
function createEnvText() {
  let text = '';
  Object.entries(envContents).forEach(([key, value]) => {
    text += `${key}=${serializeEnvValue(value, key)}\n`;
  });

  return text;
}

const fileName = process.argv[2] || '.env';

fs.writeFileSync(fileName, createEnvText());

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

// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * @typedef {object} TestConfiguration
 * @property {string[]} include
 * @property {string[]} exclude
 * @property {'dom' | 'node'} environment
 * @property {boolean | undefined} watch
 */

const defaultInclude = ['**/*.{test,spec}.?(c|m)[jt]s?(x)'];
const mandatoryExclude = ['**/node_modules/**', '**/.git/**'];
const settings = new Set(['include', 'exclude', 'environment', 'watch']);

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is string[]}
 */
function isGlobList(value) {
  return (
    Array.isArray(value) && value.every(item => typeof item === 'string' && item.trim() !== '')
  );
}

/**
 * @param {Record<string, unknown>} value
 * @param {string} name
 * @param {string[]} defaults
 * @returns {string[]}
 */
function readGlobs(value, name, defaults) {
  const globs = Object.hasOwn(value, name) ? value[name] : undefined;
  if (globs === undefined) return [...defaults];
  if (!isGlobList(globs)) {
    throw new Error(`headlamp.test.${name} must be an array of non-empty glob strings.`);
  }
  return [...globs];
}

/**
 * @param {unknown} value
 * @returns {TestConfiguration}
 */
function normalizeTestConfiguration(value) {
  if (!isObject(value)) {
    throw new Error('headlamp.test must be an object.');
  }
  for (const setting of Object.keys(value)) {
    if (!settings.has(setting)) {
      throw new Error(`Unsupported headlamp.test setting "${setting}".`);
    }
  }
  const include = readGlobs(value, 'include', defaultInclude);
  const exclude = readGlobs(value, 'exclude', []);
  /** @type {'dom' | 'node'} */
  let environment = 'dom';
  const configuredEnvironment = Object.hasOwn(value, 'environment') ? value.environment : undefined;
  if (configuredEnvironment !== undefined) {
    if (configuredEnvironment !== 'dom' && configuredEnvironment !== 'node') {
      throw new Error('headlamp.test.environment must be "dom" or "node".');
    }
    environment = configuredEnvironment;
  }
  /** @type {boolean | undefined} */
  let watch;
  const configuredWatch = Object.hasOwn(value, 'watch') ? value.watch : undefined;
  if (configuredWatch !== undefined) {
    if (typeof configuredWatch !== 'boolean') {
      throw new Error('headlamp.test.watch must be a boolean.');
    }
    watch = configuredWatch;
  }
  return {
    include,
    exclude: [...new Set([...mandatoryExclude, ...exclude])],
    environment,
    watch,
  };
}

/**
 * @param {string} directory
 * @returns {TestConfiguration}
 */
function readTestConfiguration(directory) {
  const packagePath = path.join(directory, 'package.json');
  let packageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Cannot parse test configuration in "${packagePath}".`, { cause: error });
    }
    throw error;
  }
  if (!isObject(packageJson)) {
    throw new Error(`"${packagePath}" must contain a package object.`);
  }
  const headlamp = Object.hasOwn(packageJson, 'headlamp') ? packageJson.headlamp : undefined;
  if (headlamp === undefined) return normalizeTestConfiguration({});
  if (!isObject(headlamp)) {
    throw new Error(`headlamp must be an object in "${packagePath}".`);
  }
  const configuration = Object.hasOwn(headlamp, 'test') ? headlamp.test : undefined;
  return normalizeTestConfiguration(configuration === undefined ? {} : configuration);
}

module.exports = { normalizeTestConfiguration, readTestConfiguration };

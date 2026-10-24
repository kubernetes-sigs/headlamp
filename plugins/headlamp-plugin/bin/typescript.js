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

/** @param {{ dependencies?: object, devDependencies?: object }} packageJson */
function usesNativeTypeScript(packageJson) {
  return (
    Object.hasOwn(packageJson.dependencies || {}, '@typescript/native') ||
    Object.hasOwn(packageJson.devDependencies || {}, '@typescript/native')
  );
}

/**
 * Select the explicitly opted-in compiler, never a tooling or PATH fallback.
 * @param {string} projectDirectory
 * @returns {{ file: string, args: string[] } | undefined}
 */
function getNativeTypeScriptCommand(projectDirectory) {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectDirectory, 'package.json'), 'utf8')
  );
  if (!usesNativeTypeScript(packageJson)) {
    return undefined;
  }

  try {
    const packagePath = require.resolve('@typescript/native/package.json', {
      paths: [projectDirectory],
    });
    const nativePackage = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    if (!/^7\.\d+\.\d+$/.test(nativePackage.version)) {
      throw new Error(`Expected stable TypeScript 7, found ${nativePackage.version}.`);
    }
    const bin = nativePackage.bin?.tsc;
    if (typeof bin !== 'string') {
      throw new Error('@typescript/native does not provide a tsc bin.');
    }
    const compiler = path.resolve(path.dirname(packagePath), bin);
    if (!fs.statSync(compiler).isFile()) {
      throw new Error(`Native tsc bin is not a file: ${compiler}`);
    }
    return { file: process.execPath, args: [compiler, '--noEmit'] };
  } catch (cause) {
    throw new Error(
      `Cannot run @typescript/native for "${projectDirectory}". ` +
        'Install stable TypeScript 7 as @typescript/native and run npm install. ' +
        `Legacy TypeScript will not be used instead. ${cause.message}`,
      { cause }
    );
  }
}

/**
 * Preserve the existing template replacement policy, except for the opted-in compiler.
 * @param {{ dependencies?: object, devDependencies?: object }} packageJson
 * @param {Record<string, string>} templateOverrides
 */
function getUpgradeOverrides(packageJson, templateOverrides) {
  const overrides = { ...templateOverrides };
  if (usesNativeTypeScript(packageJson)) {
    delete overrides.typescript;
  }
  return overrides;
}

module.exports = { usesNativeTypeScript, getNativeTypeScriptCommand, getUpgradeOverrides };

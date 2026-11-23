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

const { execSync } = require('child_process');

/**
 * Convert electron-builder architecture names to Go GOARCH values.
 *
 * Why this exists:
 * electron-builder and Go use different architecture identifiers for some targets
 * (for example, electron uses "x64" while Go expects "amd64"). We normalize here
 * so `make backend` receives a valid GOARCH.
 *
 * Known mappings:
 * - x64 -> amd64
 * - armv7l -> arm
 * - ia32 -> 386
 * - arm64 -> (passthrough; already valid for GOARCH)
 *
 * Unknown values are passed through unchanged so existing/custom workflows do not
 * break unexpectedly.
 *
 * @param {string} electronArch
 * @returns {string}
 */
function mapElectronArchToGoArch(electronArch) {
  const archMap = {
    x64: 'amd64',
    armv7l: 'arm',
    ia32: '386',
  };

  return archMap[electronArch] || electronArch;
}

exports.mapElectronArchToGoArch = mapElectronArchToGoArch;

exports.default = async context => {
  const startedAt = Date.now();
  console.log(
    `[build-timing] Electron backend hook started at ${new Date(startedAt).toISOString()}`
  );
  const arch = mapElectronArchToGoArch(context.arch);

  let osName = '';
  let goos = '';
  if (context.platform.name === 'windows') {
    osName = 'Windows_NT';
    goos = 'windows';
  } else if (context.platform.name === 'mac') {
    goos = 'darwin';
  } else if (context.platform.name === 'linux') {
    goos = 'linux';
  }

  execSync('make backend', {
    env: {
      ...process.env, // needed otherwise important vars like PATH and GOROOT are not set
      GOARCH: arch,
      GOOS: goos,
      OS: osName,
    },
    cwd: '..',
  });
  console.log(
    `[build-timing] Electron backend hook completed in ${((Date.now() - startedAt) / 1000).toFixed(
      3
    )}s`
  );
};

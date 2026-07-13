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
  };

  return archMap[electronArch] || electronArch;
}

exports.default = async context => {
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
};

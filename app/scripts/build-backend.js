'use strict';

const { execSync } = require('child_process');

exports.default = async context => {
  let arch = context.arch;
  if (arch === 'x64') {
    arch = 'amd64';
  } else if (arch === 'armv7l') {
    arch = 'arm';
  }

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

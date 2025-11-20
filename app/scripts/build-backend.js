'use strict';

const { execFileSync } = require('child_process');

exports.default = async context => {
  let arch = context.arch;
  if (arch === 'x64') {
    arch = 'amd64';
  } else if (arch === 'armv7l') {
    arch = 'arm';
  }

  let osName = '';
  if (context.platform.name === 'windows') {
    osName = 'Windows_NT';
  }

  execFileSync('make', ['backend'], {
    env: {
      ...process.env, // needed otherwise important vars like PATH and GOROOT are not set
      GOARCH: arch,
      OS: osName,
    },
    cwd: '..',
  });
};

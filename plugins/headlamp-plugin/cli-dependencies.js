// CLI-only dependencies that frontend doesn't have
exports.cliOnlyDependencies = [
  'env-paths',
  'shx',
  'fs-extra',
  'validate-npm-package-name',
  'yargs',
  'vm-browserify',
  'table',
  'tar',
  'tmp',
  'vite-plugin-css-injected-by-js',
  'vite-plugin-static-copy',
  'ajv',
];

// Additional runtime dependencies needed by CLI but also used by frontend
exports.additionalCliDependencies = [
  'vite', // Required for plugin builds
  'js-yaml', // Required for plugin management
  'semver',

  // Required by vite.config.mjs
  '@vitejs/plugin-react',
  'vite-plugin-node-polyfills',
  'vite-plugin-svgr',
  'vite-plugin-css-injected-by-js',
];

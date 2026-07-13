// Be sure to have the wix tool set installed.
const { MSICreator } = require('electron-wix-msi');
const fs = require('fs');
const path = require('path');
const info = require('../../package.json');

// Detect the architecture from the dist directory
// electron-builder creates win-unpacked for x64 and win-arm64-unpacked for arm64
const x64Dir = path.resolve(__dirname, '../../dist/win-unpacked');
const arm64Dir = path.resolve(__dirname, '../../dist/win-arm64-unpacked');

/**
 * Resolves the MSI target architecture and matching electron-builder output directory.
 *
 * Selection order:
 * 1. Explicit environment variable (`MSI_ARCH`, `ARCH`, or `npm_config_arch`).
 * 2. Auto-detection from available dist folders.
 *
 * Cases where architecture is NOT explicitly set:
 * - Running this script directly, e.g. `node app/windows/msi/build.js`.
 * - Invoking the script from tooling that does not pass `MSI_ARCH`, `ARCH`,
 *   or `npm_config_arch`.
 * - Older/custom workflows that package Windows binaries first and run MSI
 *   creation separately without exporting an arch variable.
 *
 * Note: `make app-win-msi-x64` and `make app-win-msi-arm64` set `MSI_ARCH`
 * explicitly, and `make app-win-msi` invokes both of those targets.
 *
 * This function terminates the process with a clear error message for invalid or
 * ambiguous inputs (unsupported architecture, missing dist directory, both dist
 * directories present without explicit selection, or no dist directories found).
 *
 * @returns {{ arch: 'x64' | 'arm64', appDir: string }}
 */
function resolveBuildArchitecture() {
  const explicitArch =
    process.env.MSI_ARCH || process.env.ARCH || process.env.npm_config_arch || '';

  if (explicitArch) {
    const normalizedArch = explicitArch.toLowerCase();
    if (normalizedArch !== 'x64' && normalizedArch !== 'arm64') {
      console.error(`Unsupported architecture "${explicitArch}". Expected "x64" or "arm64".`);
      process.exit(1);
    }

    const appDir = normalizedArch === 'arm64' ? arm64Dir : x64Dir;
    if (!fs.existsSync(appDir)) {
      console.error(
        `Explicit architecture "${normalizedArch}" selected, but directory "${appDir}" does not exist. ` +
          'Please run electron-builder for this architecture first.'
      );
      process.exit(1);
    }

    console.log(`Using explicitly selected architecture: ${normalizedArch}`);
    return { arch: normalizedArch, appDir };
  }

  const hasX64 = fs.existsSync(x64Dir);
  const hasArm64 = fs.existsSync(arm64Dir);

  if (hasX64 && hasArm64) {
    console.error(
      'Both x64 and ARM64 builds were found. ' +
        'Please specify which architecture to package by setting one of MSI_ARCH, ARCH, or npm_config_arch (x64 or arm64).'
    );
    process.exit(1);
  }

  if (hasArm64) {
    console.log('Detected ARM64 build');
    return { arch: 'arm64', appDir: arm64Dir };
  }

  if (hasX64) {
    console.log('Detected x64 build');
    return { arch: 'x64', appDir: x64Dir };
  }

  console.error('No unpacked Windows build found. Please run electron-builder first.');
  process.exit(1);
}

const { arch: ARCH, appDir: APP_DIR } = resolveBuildArchitecture();

const OUT_DIR = path.resolve(__dirname, '../../dist');

// Use different UUIDs for different architectures to allow side-by-side installation
const APP_UUIDS = {
  x64: 'b5678886-26a5-4a15-8513-17d67aaeaf68',
  arm64: 'c6789997-37b6-5b26-9624-28e78bbfbf79',
};
const APP_UUID = APP_UUIDS[ARCH];

const nameOptions = {
  productName: info.productName,
  version: info.version,
  os: 'win',
  arch: ARCH,
};

// Generate the exe name from electron-builder's artifactName
let installerName = info.build.artifactName.split('.')[0];
Object.entries(nameOptions).forEach(([key, value]) => {
  installerName = installerName.replace(`\${${key}}`, value);
});
installerName += '.msi';

// For reference: https://github.com/felixrieseberg/electron-wix-msi#configuration
const msiOptions = {
  appDirectory: APP_DIR,
  outputDirectory: OUT_DIR,
  description: info.description,
  exe: info.name, // Name of the executable to launch the app, not the final installer.
  arch: ARCH,
  name: info.productName,
  shortName: info.shortName || info.productName, // Needs to be a name without spaces!
  manufacturer: info.author.name,
  version: info.version,
  upgradeCode: APP_UUID,
  appIconPath: path.resolve(__dirname, '../../build/icons/icon.ico'),
  ui: {
    chooseDirectory: true,
  },
};

console.info('Generating MSI with the following options:', msiOptions);

const msiCreator = new MSICreator(msiOptions);

msiCreator.create().then(async () => {
  await msiCreator.compile();

  // Rename the executable to the full name we want.
  const installerPath = path.join(OUT_DIR, installerName);
  fs.renameSync(path.join(OUT_DIR, msiOptions.exe + '.msi'), installerPath);

  console.info('Created .msi installer at: ', installerPath);
});

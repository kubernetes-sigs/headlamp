// Be sure to have the wix tool set installed.
const { MSICreator } = require('electron-wix-msi');
const fs = require('fs');
const path = require('path');
const info = require('../../package.json');

const APP_DIR = path.resolve(__dirname, '../../dist/win-unpacked');
const OUT_DIR = path.resolve(__dirname, '../../dist');
const ARCH = 'x64';
const APP_UUID = 'b5678886-26a5-4a15-8513-17d67aaeaf68';

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

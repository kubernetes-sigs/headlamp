const fs = require('fs');
const path = require('path');
const tar = require('tar');
const glob = require('glob');
var zlib = require('zlib');
const os = require('os');
const https = require('https');

const PLUGIN_FOLDER = path.join(__dirname, '../../.plugins');
const MANIFEST_FILE = path.join(__dirname, '../app-build-manifest.json');

const manifest = require(MANIFEST_FILE);

async function extractArchive(
  name,
  archivePath,
  tmpFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-plugins'))
) {
  console.log('Extracting archive', archivePath, 'to', tmpFolder, '...');
  // Extract the archive
  const p = new Promise((resolve, reject) => {
    fs.createReadStream(archivePath)
      .pipe(zlib.createGunzip())
      .pipe(
        tar.x({
          C: tmpFolder,
        })
      )
      .on('error', err => {
        console.error(`Error extracting archive: ${err}`);
        reject(err);
      })
      .on('end', () => {
        console.log('Extracted archive');
        const pluginFolder = path.join(PLUGIN_FOLDER, name);
        if (!fs.existsSync(pluginFolder)) {
          fs.mkdirSync(pluginFolder);
        }

        // Move the plugins contents to the plugins folder
        const mainLocationExpr = path.join(tmpFolder, '*', 'main.js').replace(/\\/g, '/');
        const mainLocations = glob.sync(mainLocationExpr);
        const mainLocation = mainLocations[0];
        if (mainLocation && fs.existsSync(mainLocation)) {
          fs.copyFileSync(path.join(mainLocation), path.join(pluginFolder, 'main.js'));
          const packageJsonLocation = path.dirname(mainLocation);
          fs.copyFileSync(
            path.join(packageJsonLocation, 'package.json'),
            path.join(pluginFolder, 'package.json')
          );
          resolve();
          return;
        }

        // Compatibility with legacy tarball structure
        if (fs.existsSync(path.join(tmpFolder, 'package', 'dist'))) {
          // Move the plugins contents to the plugins folder
          fs.copyFileSync(
            path.join(tmpFolder, 'package', 'dist', 'main.js'),
            path.join(pluginFolder, 'main.js')
          );
          fs.copyFileSync(
            path.join(tmpFolder, 'package', 'package.json'),
            path.join(pluginFolder, 'package.json')
          );
        }
        resolve();
      });
  });

  await p;
}

function downloadFile(url, path) {
  return new Promise((resolve, reject) => {
    https
      .get(url, res => {
        // Image will be stored at this path
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const filePath = fs.createWriteStream(path);
          res.pipe(filePath);
          filePath.on('error', err => {
            console.log('Error while downloading file', err);
            reject(err);
          });
          filePath.on('finish', () => {
            filePath.close();
            console.log('Download Completed', path);
            resolve();
          });
        } else if (res.headers.location) {
          // Server responded with a redirect, fetch the resource at the new location
          console.log('Redirecting to ', res.headers.location);
          downloadFile(res.headers.location, path).then(resolve).catch(reject);
        }
      })
      .on('error', err => {
        reject(err);
      });
  });
}

async function fetchArchive(name, url) {
  // Download the archive and extract it into the plugins' location
  const archiveName = url.split('/').pop();
  // Create the plugin folder if it doesn't exist
  if (!fs.existsSync(PLUGIN_FOLDER)) {
    fs.mkdirSync(PLUGIN_FOLDER);
  }

  // Create a temporary folder for the download.
  const tmpFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-plugins'));

  const archivePath = path.join(tmpFolder, archiveName);

  console.log('Downloading archive', url, 'to', archivePath, '...');

  await downloadFile(url, archivePath);

  console.log('...done');

  await extractArchive(name, archivePath, tmpFolder);

  // Remove the archive
  fs.unlinkSync(archivePath);
}

async function main() {
  const plugins = manifest.plugins;
  // Fetch the plugins from the manifest
  if (!!plugins) {
    for (const plugin of plugins) {
      const { name, archive, file } = plugin;

      console.log('Setting up plugin', name, 'from', archive || file, '...');

      if (!!archive) {
        await fetchArchive(name, archive);
      }

      if (!!file) {
        const absPath = path.join(path.dirname(MANIFEST_FILE), file);
        await extractArchive(name, absPath);
      }
    }
  }

  process.exit(0);
}

main();

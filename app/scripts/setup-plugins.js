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
          fs.mkdirSync(pluginFolder, { recursive: true });
        }

        console.log('Copying plugin to ', pluginFolder);

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
          console.log('Copied plugin from ', packageJsonLocation, ' to ', pluginFolder);
        }
        // Compatibility with legacy tarball structure
        else if (fs.existsSync(path.join(tmpFolder, 'package', 'dist'))) {
          console.log('Found plugin with a legacy tarball structure');
          // Move the plugins contents to the plugins folder
          fs.copyFileSync(
            path.join(tmpFolder, 'package', 'dist', 'main.js'),
            path.join(pluginFolder, 'main.js')
          );
          fs.copyFileSync(
            path.join(tmpFolder, 'package', 'package.json'),
            path.join(pluginFolder, 'package.json')
          );
        } else {
          console.error('Failed to find plugin content within tarball');
          console.error({
            archivePath,
            unarchivedPath: tmpFolder,
          });
          reject();
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

async function main(plugins = manifest.plugins) {
  // Fetch the plugins from the manifest
  if (!!plugins) {
    for (const plugin of plugins) {
      const { name, archive, file, enabledByDefault } = plugin;

      console.log('Setting up plugin', name, 'from', archive || file, '...');

      if (!!archive) {
        await fetchArchive(name, archive);
      }

      if (!!file) {
        const absPath = path.resolve(path.dirname(MANIFEST_FILE), file);
        await extractArchive(name, absPath);
      }

      const pluginFolder = path.join(PLUGIN_FOLDER, name);
      const packageJsonPath = path.join(pluginFolder, 'package.json');

      if (enabledByDefault !== undefined && fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          packageJson.headlamp = packageJson.headlamp || {};
          packageJson.headlamp.enabledByDefault = enabledByDefault;

          fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
          console.log(`Plugin ${name} enabledByDefault: ${enabledByDefault}`);
        } catch (error) {
          console.error(`Failed to update enabledByDefault for plugin ${name}:`, error);
        }
      }
    }
  }
}

function runCli(setup = main, exit = process.exit) {
  return setup().then(
    () => exit(0),
    error => {
      console.error('Failed to set up plugins:', error);
      exit(1);
    }
  );
}

if (require.main === module) {
  runCli();
}

module.exports = { main, runCli };

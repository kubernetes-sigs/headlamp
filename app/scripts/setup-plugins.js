const fs = require('fs');
const path = require('path');
const tar = require('tar');
const glob = require('glob');
var zlib = require('zlib');
const os = require('os');
const https = require('https');
const crypto = require('node:crypto');
const {
  DEFAULT_MANIFEST_FILE,
  loadBuildManifest,
  resolveBuildManifestPath,
} = require('./build-manifest');

const PLUGIN_FOLDER = path.join(__dirname, '../../.plugins');
const MANIFEST_FILE = resolveBuildManifestPath();
const manifest = loadBuildManifest(MANIFEST_FILE);
const externalManifest = MANIFEST_FILE !== DEFAULT_MANIFEST_FILE;
const VALID_PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;

function validatePluginSource(plugin, requireDigest = externalManifest) {
  if (plugin.archive && requireDigest && plugin.sha256 === undefined) {
    throw new Error(`External plugin archive ${plugin.name} must declare a SHA-256 digest`);
  }
  if (
    requireDigest &&
    (typeof plugin.packageName !== 'string' || !VALID_PACKAGE_NAME.test(plugin.packageName))
  ) {
    throw new Error(`External plugin ${plugin.name} must declare a valid package name`);
  }
}

function verifyPluginIdentity(packageJsonPath, expectedPackageName) {
  if (expectedPackageName === undefined) {
    return;
  }
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (packageJson.name !== expectedPackageName) {
    throw new Error(
      `Plugin package name mismatch: expected ${expectedPackageName}, got ${packageJson.name}`
    );
  }
}

function verifyArchiveDigest(archivePath, expectedDigest) {
  if (expectedDigest === undefined) {
    return;
  }
  if (!/^[a-f0-9]{64}$/i.test(expectedDigest)) {
    throw new Error(`Invalid SHA-256 digest for plugin archive: ${expectedDigest}`);
  }

  const actualDigest = crypto
    .createHash('sha256')
    .update(fs.readFileSync(archivePath))
    .digest('hex');
  if (actualDigest.toLowerCase() !== expectedDigest.toLowerCase()) {
    throw new Error(
      `Plugin archive SHA-256 mismatch: expected ${expectedDigest}, got ${actualDigest}`
    );
  }
}

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

function downloadFile(url, path, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      reject(new Error(`Invalid plugin archive URL: ${url}`));
      return;
    }
    if (parsedUrl.protocol !== 'https:') {
      reject(new Error(`Plugin archive URL must use HTTPS: ${url}`));
      return;
    }
    if (redirectCount > 5) {
      reject(new Error(`Too many redirects while downloading plugin archive: ${url}`));
      return;
    }

    https
      .get(parsedUrl, res => {
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
          const redirectUrl = new URL(res.headers.location, parsedUrl).toString();
          console.log('Redirecting to ', redirectUrl);
          res.resume();
          downloadFile(redirectUrl, path, redirectCount + 1)
            .then(resolve)
            .catch(reject);
        } else {
          res.resume();
          reject(new Error(`Plugin archive download failed with status ${res.statusCode}: ${url}`));
        }
      })
      .on('error', err => {
        reject(err);
      });
  });
}

async function fetchArchive(name, url, sha256) {
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
  verifyArchiveDigest(archivePath, sha256);

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
      const { name, packageName, archive, file, sha256 } = plugin;
      validatePluginSource(plugin);

      console.log('Setting up plugin', name, 'from', archive || file, '...');

      if (!!archive) {
        await fetchArchive(name, archive, sha256);
      }

      if (!!file) {
        const absPath = path.join(path.dirname(MANIFEST_FILE), file);
        verifyArchiveDigest(absPath, sha256);
        await extractArchive(name, absPath);
      }

      const packageJsonPath = path.join(PLUGIN_FOLDER, name, 'package.json');
      verifyPluginIdentity(packageJsonPath, packageName);
    }
  }

  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  downloadFile,
  fetchArchive,
  main,
  validatePluginSource,
  verifyArchiveDigest,
  verifyPluginIdentity,
};

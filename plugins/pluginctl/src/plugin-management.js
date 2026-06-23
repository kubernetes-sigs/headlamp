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

/**
 * plugin-management-utils.js has the core logic for managing plugins in Headlamp.
 *
 * Provides methods for installing, updating, listing and uninstalling plugins.
 *
 * Used by:
 * - plugins/headlamp-plugin/bin/headlamp-plugin.js cli
 * - plugins/pluginctl/bin/pluginctl.js cli
 * - app/ to manage plugins.
 */
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const tar = require('tar');
const path = require('path');
const crypto = require('crypto');
const stream = require('stream');
const semver = require('semver');
const envPaths = require('env-paths');

// comment out for testing
// function sleep(ms) {
//   // console.log(ms)
//   // return new Promise(function (resolve) {
//   //   setTimeout(resolve, ms+2000);
//   // });
// }

/**
 * Move directories from currentPath to newPath by copying.
 * @param currentPath from this path
 * @param newPath to this path
 */
function moveDirs(currentPath, newPath) {
  try {
    fs.cpSync(currentPath, newPath, { recursive: true, force: true });
    fs.rmSync(currentPath, { recursive: true });
    console.log(`Moved directory from ${currentPath} to ${newPath}`);
  } catch (err) {
    console.error(`Error moving directory from ${currentPath} to ${newPath}:`, err);
    throw err;
  }
}

class PluginManager {
  /**
   * Installs a plugin from the specified URL.
   * @param {string} URL - The URL of the plugin to install.
   * @param {string} [destinationFolder=defaultPluginsDir()] - The folder where the plugin will be installed.
   * @param {string} [headlampVersion=""] - The version of Headlamp for compatibility checking.
   * @param {function} [progressCallback=null] - Optional callback for progress updates.
   * @param {AbortSignal} [signal=null] - Optional AbortSignal for cancellation.
   * @param {string} [pluginVersion=""] - The version of the plugin to install.
   * @returns {Promise<void>} A promise that resolves when the installation is complete.
   */
  static async install(
    URL,
    destinationFolder = defaultPluginsDir(),
    headlampVersion = '',
    progressCallback = null,
    signal = null,
    pluginVersion = ''
  ) {
    try {
      const [name, tempFolder] = await downloadExtractPlugin(
        URL,
        headlampVersion,
        progressCallback,
        signal,
        pluginVersion
      );

      // sleep(2000);  // comment out for testing

      // create the destination folder if it doesn't exist
      if (!fs.existsSync(destinationFolder)) {
        fs.mkdirSync(destinationFolder, { recursive: true });
      }
      // move the plugin to the destination folder
      moveDirs(tempFolder, path.join(destinationFolder, path.basename(name)));
      if (progressCallback) {
        progressCallback({ type: 'success', message: 'Plugin Installed' });
      }
    } catch (e) {
      if (progressCallback) {
        progressCallback({ type: 'error', message: e.message });
      } else {
        throw e;
      }
    }
  }

  /**
   * Updates an installed plugin to the latest version.
   * @param {string} pluginName - The name of the plugin to update.
   * @param {string} [destinationFolder=defaultPluginsDir()] - The folder where the plugin is installed.
   * @param {string} [headlampVersion=""] - The version of Headlamp for compatibility checking.
   * @param {function} [progressCallback=null] - Optional callback for progress updates.
   * @param {AbortSignal} [signal=null] - Optional AbortSignal for cancellation.
   * @returns {Promise<void>} A promise that resolves when the update is complete.
   */
  static async update(
    pluginName,
    destinationFolder = defaultPluginsDir(),
    headlampVersion = '',
    progressCallback = null,
    signal = null
  ) {
    try {
      const installedPlugins = PluginManager.list(destinationFolder);
      const plugin = installedPlugins.find(p => p.pluginName === pluginName);
      if (!plugin) {
        throw new Error('Plugin not found');
      }

      const pluginDir = path.join(destinationFolder, plugin.folderName);
      // read the package.json of the plugin
      const packageJsonPath = path.join(pluginDir, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      const pluginData = await fetchPluginInfo(plugin.artifacthubURL, progressCallback, signal);

      const latestVersion = pluginData.version;
      const currentVersion = packageJson.artifacthub.version;

      if (semver.lte(latestVersion, currentVersion)) {
        throw new Error('No updates available');
      }

      // eslint-disable-next-line no-unused-vars
      const [_, tempFolder] = await downloadExtractPlugin(
        plugin.artifacthubURL,
        headlampVersion,
        progressCallback,
        signal
      );

      // sleep(2000);  // comment out for testing

      // create the destination folder if it doesn't exist
      if (!fs.existsSync(destinationFolder)) {
        fs.mkdirSync(destinationFolder, { recursive: true });
      }

      // remove the existing plugin folder
      fs.rmdirSync(pluginDir, { recursive: true });

      // create the plugin folder
      fs.mkdirSync(pluginDir, { recursive: true });

      // move the plugin to the destination folder
      moveDirs(tempFolder, pluginDir);
      if (progressCallback) {
        progressCallback({ type: 'success', message: 'Plugin Updated' });
      }
    } catch (e) {
      if (progressCallback) {
        progressCallback({ type: 'error', message: e.message });
      } else {
        throw e;
      }
    }
  }

  /**
   * Uninstalls a plugin from the specified folder.
   * @param {string} name - The name of the plugin to uninstall.
   * @param {string} [folder=defaultPluginsDir()] - The folder where the plugin is installed.
   * @param {function} [progressCallback=null] - Optional callback for progress updates.
   * @returns {void}
   */
  static uninstall(name, folder = defaultPluginsDir(), progressCallback = null) {
    try {
      const installedPlugins = PluginManager.list(folder);
      const plugin = installedPlugins.find(p => p.pluginName === name);
      if (!plugin) {
        throw new Error('Plugin not found');
      }

      const pluginDir = path.join(folder, plugin.folderName);
      if (!checkValidPluginFolder(pluginDir)) {
        throw new Error('Invalid plugin folder');
      }

      if (fs.existsSync(pluginDir)) {
        fs.rmdirSync(pluginDir, { recursive: true });
      } else {
        throw new Error('Plugin not found');
      }
      if (progressCallback) {
        progressCallback({ type: 'success', message: 'Plugin Uninstalled' });
      }
    } catch (e) {
      if (progressCallback) {
        progressCallback({ type: 'error', message: e.message });
      } else {
        throw e;
      }
    }
  }

  /**
   * Lists all valid plugins in the specified folder.
   * @param {string} [folder=defaultPluginsDir()] - The folder to list plugins from.
   * @param {function} [progressCallback=null] - Optional callback for progress updates.
   * @returns {Array<object>} An array of objects representing valid plugins.
   */
  static list(folder = defaultPluginsDir(), progressCallback = null) {
    try {
      const pluginsData = [];

      // Check if folder exists, if not return empty array
      if (!fs.existsSync(folder)) {
        if (progressCallback) {
          progressCallback({ type: 'success', message: 'No plugins folder found', data: [] });
          return;
        }
        return [];
      }

      // Read all entries in the specified folder
      const entries = fs.readdirSync(folder, { withFileTypes: true });

      // Filter out directories (plugins)
      const pluginFolders = entries.filter(entry => entry.isDirectory());

      // Iterate through each plugin folder
      for (const pluginFolder of pluginFolders) {
        const pluginDir = path.join(folder, pluginFolder.name);

        if (checkValidPluginFolder(pluginDir)) {
          // Read package.json to get the plugin name and version
          const packageJsonPath = path.join(pluginDir, 'package.json');
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          const pluginName = packageJson.name || pluginFolder.name;
          const pluginTitle = packageJson.artifacthub.title;
          const pluginVersion = packageJson.version || null;
          const artifacthubURL = packageJson.artifacthub ? packageJson.artifacthub.url : null;
          const repoName = packageJson.artifacthub ? packageJson.artifacthub.repoName : null;
          const author = packageJson.artifacthub ? packageJson.artifacthub.author : null;
          const artifacthubVersion = packageJson.artifacthub
            ? packageJson.artifacthub.version
            : null;
          // Store plugin data (folder name and plugin name)
          pluginsData.push({
            pluginName,
            pluginTitle,
            pluginVersion,
            folderName: pluginFolder.name,
            artifacthubURL: artifacthubURL,
            repoName: repoName,
            author: author,
            artifacthubVersion: artifacthubVersion,
          });
        }
      }

      if (progressCallback) {
        progressCallback({ type: 'success', message: 'Plugins Listed', data: pluginsData });
      } else {
        return pluginsData;
      }
    } catch (e) {
      if (progressCallback) {
        progressCallback({ type: 'error', message: e.message });
      } else {
        throw e;
      }
    }
  }
}

/**
 * Checks the plugin name is a valid one.
 *
 * Look for "..", "/", or "\" in the plugin name.
 *
 * @param {string} pluginName
 *
 * @returns true if the name is valid.
 */
function validatePluginName(pluginName) {
  const invalidPattern = /[\/\\]|(\.\.)/;
  return !invalidPattern.test(pluginName);
}

/**
 * @param {string} archiveURL - the one to validate
 * @returns true if the archiveURL looks good.
 */
function validateArchiveURL(archiveURL) {
  const githubRegex = /^https:\/\/github\.com\/[^/]+\/[^/]+\/(releases|archive)\/.*$/;
  const bitbucketRegex = /^https:\/\/bitbucket\.org\/[^/]+\/[^/]+\/(downloads|get)\/.*$/;
  const gitlabRegex = /^https:\/\/gitlab\.com\/[^/]+\/[^/]+\/(-\/archive|releases)\/.*$/;

  // @todo There is a test plugin at https://github.com/yolossn/headlamp-plugins/
  // need to move that somewhere else, or test differently.

  return (
    githubRegex.test(archiveURL) ||
    bitbucketRegex.test(archiveURL) ||
    gitlabRegex.test(archiveURL) ||
    archiveURL.startsWith('https://github.com/yolossn/headlamp-plugins/')
  );
}

/**
 * Downloads and extracts a plugin from the specified URL.
 * @param {string} URL - The URL of the plugin to download and extract.
 * @param {string} headlampVersion - The version of Headlamp for compatibility checking.
 * @param {function} progressCallback - A callback function for reporting progress.
 * @param {AbortSignal} signal - An optional AbortSignal for cancellation.
 * @param {string} [pluginVersion=""] - The version of the plugin to install.
 * @returns {Promise<[string, string]>} A promise that resolves to an array containing the plugin name and temporary folder path.
 */
async function downloadExtractPlugin(
  URL,
  headlampVersion,
  progressCallback,
  signal,
  pluginVersion
) {
  // fetch plugin metadata
  if (signal && signal.aborted) {
    throw new Error('Download cancelled');
  }
  const pluginInfo = await fetchPluginInfo(URL, progressCallback, signal, pluginVersion);
  // await sleep(4000);  // comment out for testing

  if (signal && signal.aborted) {
    throw new Error('Download cancelled');
  }
  if (progressCallback) {
    progressCallback({ type: 'info', message: 'Plugin Metadata Fetched' });
  }
  if (!pluginInfo || pluginInfo.message === '') {
    throw new Error('Unable to fetch plugin metadata. Please check the plugin details.');
  }
  const pluginName = pluginInfo.name;
  if (!validatePluginName(pluginName)) {
    throw new Error('Invalid plugin name');
  }

  const archiveURL = pluginInfo.data['headlamp/plugin/archive-url'];
  if (!validateArchiveURL(archiveURL)) {
    throw new Error('Invalid plugin/archive-url');
  }

  let checksum = pluginInfo.data['headlamp/plugin/archive-checksum'];
  if (!archiveURL || !checksum) {
    throw new Error('Invalid plugin metadata. Please check the plugin details.');
  }
  if (checksum.startsWith('sha256:') || checksum.startsWith('SHA256:')) {
    checksum = checksum.replace('sha256:', '');
    checksum = checksum.replace('SHA256:', '');
  }

  // check if the plugin is compatible with the current Headlamp version
  if (headlampVersion) {
    if (progressCallback) {
      progressCallback({ type: 'info', message: 'Checking compatibility with Headlamp version' });
    }
    if (semver.satisfies(headlampVersion, pluginInfo.data['headlamp/plugin/version-compat'])) {
      if (progressCallback) {
        progressCallback({ type: 'info', message: 'Headlamp version is compatible' });
      }
    } else {
      throw new Error('Headlamp version is not compatible with the plugin');
    }
  }

  if (signal && signal.aborted) {
    throw new Error('Download cancelled');
  }

  const tempDir = await fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-plugin-temp-'));
  const tempFolder = fs.mkdirSync(path.join(tempDir, pluginName), { recursive: true });

  if (progressCallback) {
    progressCallback({ type: 'info', message: 'Downloading Plugin' });
  }
  if (signal && signal.aborted) {
    throw new Error('Download cancelled');
  }

  // await sleep(4000); // comment out for testing
  const archResponse = await fetch(archiveURL, { redirect: 'follow', follow: 10 }, { signal });
  if (!archResponse.ok) {
    throw new Error(`Failed to download tarball. Status code: ${archResponse.status}`);
  }

  if (signal && signal.aborted) {
    throw new Error('Download cancelled');
  }

  if (progressCallback) {
    progressCallback({ type: 'info', message: 'Plugin Downloaded' });
  }

  const archChunks = [];
  let archBufferLengeth = 0;

  for await (const chunk of archResponse.body) {
    archChunks.push(chunk);
    archBufferLengeth += chunk.length;
  }

  const archBuffer = Buffer.concat(archChunks, archBufferLengeth);

  const archiveChecksum = crypto.createHash('sha256').update(archBuffer).digest('hex');

  if (archiveChecksum !== checksum) {
    throw new Error('Checksum mismatch.');
  }

  if (signal && signal.aborted) {
    throw new Error('Download cancelled');
  }

  if (progressCallback) {
    progressCallback({ type: 'info', message: 'Extracting Plugin' });
  }
  const archStream = new stream.PassThrough();
  archStream.end(archBuffer);

  const extractStream = archStream.pipe(zlib.createGunzip()).pipe(
    tar.extract({
      cwd: tempFolder,
      strip: 1,
      sync: true,
    })
  );

  await new Promise((resolve, reject) => {
    extractStream.on('finish', () => {
      resolve();
    });
    extractStream.on('error', err => {
      reject(err);
    });
  });

  if (signal && signal.aborted) {
    throw new Error('Download cancelled');
  }

  if (progressCallback) {
    progressCallback({ type: 'info', message: 'Plugin Extracted' });
  }
  // add artifacthub metadata to the plugin
  const packageJSON = JSON.parse(fs.readFileSync(`${tempFolder}/package.json`, 'utf8'));
  packageJSON.artifacthub = {
    name: pluginName,
    title: pluginInfo.display_name,
    url: `https://artifacthub.io/packages/headlamp/${pluginInfo.repository.name}/${pluginName}`,
    version: pluginInfo.version,
    repoName: pluginInfo.repository.name,
    author: pluginInfo.repository.user_alias,
  };
  packageJSON.isManagedByHeadlampPlugin = true;
  fs.writeFileSync(`${tempFolder}/package.json`, JSON.stringify(packageJSON, null, 2));
  return [pluginName, tempFolder];
}

/**
 * Fetches plugin metadata from the specified URL.
 * @param {string} URL - The URL to fetch plugin metadata from.
 * @param {function} progressCallback - A callback function for reporting progress.
 * @param {AbortSignal} signal - An optional AbortSignal for cancellation.
 * @param {string} [pluginVersion=""] - The version of the plugin to install.
 * @returns {Promise<object>} A promise that resolves to the fetched plugin metadata.
 */
async function fetchPluginInfo(URL, progressCallback, signal, pluginVersion) {
  try {
    if (!URL.startsWith('https://artifacthub.io/packages/headlamp/')) {
      throw new Error('Invalid URL. Please provide a valid URL from ArtifactHub.');
    }

    const apiURL = URL.replace(
      'https://artifacthub.io/packages/headlamp/',
      'https://artifacthub.io/api/v1/packages/headlamp/'
    );

    if (progressCallback) {
      progressCallback({ type: 'info', message: 'Fetching Plugin Metadata' });
    }
    let response = await fetch(apiURL, { redirect: 'follow', follow: 10 }, { signal });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    let pluginInfo = await response.json();
    if (pluginVersion && pluginVersion !== pluginInfo.version) {
      if (!pluginInfo.available_versions.map(v => v.version).includes(pluginVersion)) {
        throw new Error(
          `Plugin version ${pluginVersion} not found. Please check the plugin details.`
        );
      }
      // Remove trailing slash if present to avoid double slashes
      const baseURL = apiURL.endsWith('/') ? apiURL.slice(0, -1) : apiURL;
      response = await fetch(
        `${baseURL}/${pluginVersion}`,
        { redirect: 'follow', follow: 10 },
        { signal }
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      pluginInfo = await response.json();
    }
    return pluginInfo;
  } catch (e) {
    if (progressCallback) {
      progressCallback({ type: 'error', message: e.message });
    } else {
      throw e;
    }
  }
}

/**
 * Checks if a given folder is a valid Headlamp plugin folder.
 * A valid plugin folder must exist, contain 'main.js' and 'package.json' files,
 * and the 'package.json' file must have 'isManagedByHeadlampPlugin' set to true.
 *
 * @param {string} folder - The path to the folder to check.
 * @returns {boolean} True if the folder is a valid Headlamp plugin folder, false otherwise.
 */
function checkValidPluginFolder(folder) {
  if (!fs.existsSync(folder)) {
    return false;
  }
  // Check if the folder contains main.js and package.json
  const mainJsPath = path.join(folder, 'main.js');
  const packageJsonPath = path.join(folder, 'package.json');
  if (!fs.existsSync(mainJsPath) || !fs.existsSync(packageJsonPath)) {
    return false;
  }

  // Read package.json and check isManagedByHeadlampPlugin is set to true
  const packageJSON = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (packageJSON.isManagedByHeadlampPlugin) {
    return true;
  }
  return false;
}

/**
 * Returns the default directory where Headlamp user-installed plugins are stored.
 * If the data path exists, it is used as the base directory.
 * Otherwise, the config path is used as the base directory.
 * The 'user-plugins' subdirectory of the base directory is returned.
 *
 * @returns {string} The path to the default user-plugins directory.
 */
function defaultPluginsDir() {
  const paths = envPaths('Headlamp', { suffix: '' });
  const configDir = fs.existsSync(paths.data) ? paths.data : paths.config;
  return path.join(configDir, 'user-plugins');
}

module.exports = { PluginManager, validateArchiveURL };

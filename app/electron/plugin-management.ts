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
 * - app/ to manage plugins.
 */
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import stream from 'stream';
import zlib from 'zlib';
import envPaths from './env-paths';

let appConfigDirName = 'Headlamp';

/**
 * Sets the application name used for per-user storage directories.
 *
 * @param name - Runtime product name for the desktop application.
 */
export function setAppConfigDirName(name: string): void {
  appConfigDirName = name;
}

/**
 * Returns the base directory for application-managed user data.
 *
 * @returns The data directory when it exists, otherwise the config directory.
 */
function defaultAppDataDir(): string {
  const paths = envPaths(appConfigDirName, { suffix: '' });
  return fs.existsSync(paths.data) ? paths.data : paths.config;
}

// comment out for testing
// function sleep(ms) {
//   // console.log(ms)
//   // return new Promise(function (resolve) {
//   //   setTimeout(resolve, ms+2000);
//   // });
// }

/**
 * TLS certificate error codes that indicate a certificate verification failure.
 */
const TLS_ERROR_CODES = [
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'CERT_UNTRUSTED',
  'CERT_REJECTED',
];

/**
 * Extracts TLS error code from an error object.
 * Checks both err.code directly and err.cause.code for TLS error codes.
 *
 * @param err - The error object to extract the code from
 * @param tlsErrorCodes - Array of TLS error codes to match against
 * @returns The TLS error code if found, undefined otherwise
 */
function extractTlsErrorCode(err: unknown, tlsErrorCodes: string[]): string | undefined {
  if (!(err instanceof Error)) return undefined;
  const directCode = 'code' in err ? (err as { code?: string }).code : undefined;
  const causeCode =
    err.cause && typeof err.cause === 'object' && 'code' in err.cause
      ? (err.cause as { code: string }).code
      : undefined;
  const code = directCode ?? causeCode;
  return code && tlsErrorCodes.includes(code) ? code : undefined;
}

/**
 * `ProgressResp` is an interface for progress response.
 *
 * @interface
 * @property {string} type - The type of the progress response.
 * @property {string} message - The message of the progress response.
 * @property {Record<string, any>} data - Additional data for the progress response. Optional.
 */
interface ProgressResp {
  type: string;
  message: string;
  data?: Record<string, any>;
}

type ProgressCallback = (progress: ProgressResp) => void;

interface PluginData {
  pluginName: string;
  pluginTitle: string;
  pluginVersion: string;
  folderName: string;
  artifacthubURL: string;
  repoName: string;
  author: string;
  artifacthubVersion: string;
}

/**
 * ExtraFile is a type for extra files that can be downloaded and extracted.
 */
type ExtraFile = {
  /** URL of the file to download. */
  url: string;
  /** Checksum of the file in the format "sha256:checksum". */
  checksum: string;
  /**
   * Architecture of the file in the format "os/arch".
   * @example
   * 'win32/x64' 'darwin/arm64' 'darwin/x64' 'linux/arm64' 'linux/x64
   */
  arch: string;
  /**
   * Output files to be extracted.
   * The key is the output path and the value is the input path in the archive.
   * @example
   * output: {
   *   minikube": {
   *     output: 'minikube',
   *     input: 'out/minikube-linux-arm64'
   *   }
   * }
   */
  output: {
    [key: string]: {
      /** The output file path. */
      output: string;
      /** The input file path. */
      input: string;
    };
  };
};
export interface ArtifactHubHeadlampPkg {
  name: string;
  display_name: string;
  repository: {
    name: string;
    user_alias: string;
  };
  version: string;
  archiveURL: string;
  archiveChecksum: string;
  distroCompat: string;
  versionCompat: string;
  /**
   * Optional extra files to download.
   * @see ExtraFile
   */
  extraFiles?: Record<string, ExtraFile>;
}

/**
 * Move directories from currentPath to newPath by copying.
 * @param currentPath from this path
 * @param newPath to this path
 */
function moveDirs(currentPath: string, newPath: string) {
  try {
    fs.cpSync(currentPath, newPath, { recursive: true, force: true });
    fs.rmSync(currentPath, { recursive: true });
    console.log(`Moved directory from ${currentPath} to ${newPath}`);
  } catch (err) {
    console.error(`Error moving directory from ${currentPath} to ${newPath}:`, err);
    throw err;
  }
}

/**
 * Name of the directory inside a plugins directory used for update
 * transactions.
 *
 * Staging and backup directories for an update live under this directory.
 * Installed plugins never use it, so recovery can unambiguously identify
 * update transactions without having to distinguish them from legitimate
 * plugin directories: everything under this directory is owned by the update
 * flow, while plugin directories always live directly in the plugins
 * directory.
 */
const UPDATE_TXN_DIR_NAME = '.headlamp-txn';

/**
 * Matches transaction directories created by PluginManager.update().
 *
 * Transaction directories are named `<pluginName>.(backup|staging).<txnId>`
 * where `<txnId>` is a random 16-character hex string unique to each update
 * attempt. They only ever appear under UPDATE_TXN_DIR_NAME, so a legitimate
 * plugin whose name happens to end in `.backup` or `.staging` (or even
 * `.staging.<16 hex chars>`) can never be mistaken for an interrupted update
 * transaction.
 */
const UPDATE_TXN_DIR_PATTERN = /^(.+)\.(backup|staging)\.([0-9a-f]{16})$/;

/** Suffix of a transaction lock file, which is named `<txnId>.lock`. */
const UPDATE_TXN_LOCK_SUFFIX = '.lock';

/** Matches a transaction lock file, named `<txnId>.lock`. */
const UPDATE_TXN_LOCK_PATTERN = /^([0-9a-f]{16})\.lock$/;

/**
 * Checks whether a process is currently running.
 *
 * @param pid - The process id to check.
 * @returns true if a process with the given pid exists.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but we cannot signal it.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Reads the pid recorded in a transaction lock file.
 *
 * @param lockFile - The path to the lock file.
 * @returns The recorded pid, or null if the file is missing or unreadable.
 */
function lockOwnerPid(lockFile: string): number | null {
  try {
    const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    return typeof lock.pid === 'number' ? lock.pid : null;
  } catch {
    return null;
  }
}

/**
 * Checks whether a transaction is still owned by a live process.
 *
 * @param lockFile - The path to the transaction's lock file.
 * @returns true if the lock file exists and its recorded pid is alive.
 */
function isActiveTransaction(lockFile: string): boolean {
  const pid = lockOwnerPid(lockFile);
  return pid !== null && isProcessAlive(pid);
}

/**
 * Recovers plugins left broken by an update that crashed mid-swap.
 *
 * The swap renames the plugin to `<txnDir>/<name>.backup.<txnId>` before
 * renaming the staged content into place, so a crash between those two
 * renames leaves the backup behind with no plugin directory. On the next
 * listing or app startup, restore the backup so the previous version is
 * usable again. Stale `<txnDir>/<name>.staging.<txnId>` directories are
 * removed. Transaction directories live under a dedicated `.headlamp-txn`
 * subdirectory, so recovery never inspects user-controlled plugin directory
 * names.
 *
 * A transaction is only recovered when its `<txnId>.lock` file is missing or
 * records a pid that is no longer alive. A live owner means the update is
 * still in progress (possibly from another process, such as the
 * headlamp-plugin CLI), so recovery leaves the transaction untouched. This is
 * deliberately conservative: a stale lock whose pid has been reused by an
 * unrelated process leaves the transaction in place (a leak, not a loss), and
 * the update flow never reads these locks, so such a leak cannot block future
 * updates.
 *
 * Note that this recovery cannot make the swap itself atomic: the plugin
 * directory is briefly absent between the two renames, so a concurrent reader
 * such as the backend serving the user plugins directory may observe the
 * plugin as missing in that window. Calling this function at startup (before
 * the backend starts serving) and on every plugin listing keeps that window
 * from turning into a permanent break.
 */
export function recoverInterruptedUpdate(pluginsDir: string) {
  const txnRoot = path.join(pluginsDir, UPDATE_TXN_DIR_NAME);
  let entries: fs.Dirent[];

  try {
    entries = fs.readdirSync(txnRoot, { withFileTypes: true });
  } catch {
    return;
  }

  // If a plugin directory occupies the transaction directory name, never
  // touch its contents.
  if (fs.existsSync(path.join(txnRoot, 'package.json'))) {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const txnMatch = UPDATE_TXN_DIR_PATTERN.exec(entry.name);
    if (!txnMatch) {
      continue;
    }

    const lockFile = path.join(txnRoot, `${txnMatch[3]}${UPDATE_TXN_LOCK_SUFFIX}`);
    if (isActiveTransaction(lockFile)) {
      // The update owning this transaction is still running; leave it alone.
      continue;
    }

    const pluginDir = path.join(pluginsDir, txnMatch[1]);
    const txnDir = path.join(txnRoot, entry.name);

    if (txnMatch[2] === 'backup') {
      if (!fs.existsSync(pluginDir)) {
        try {
          fs.renameSync(txnDir, pluginDir);
          console.log(`Recovered plugin directory ${pluginDir} from interrupted update`);
        } catch (err) {
          console.error(`Error recovering plugin directory ${pluginDir}:`, err);
        }
      } else {
        // The updated plugin is already in place, so the backup is stale.
        try {
          fs.rmSync(txnDir, { recursive: true, force: true });
          console.log(`Removed stale backup directory for ${pluginDir}`);
        } catch (err) {
          console.error(`Error removing stale backup directory for ${pluginDir}:`, err);
        }
      }
    } else {
      // Staging content is never put into place until the final rename, so
      // any staging directory left behind is incomplete and safe to remove.
      try {
        fs.rmSync(txnDir, { recursive: true, force: true });
        console.log(`Removed stale staging directory for ${pluginDir}`);
      } catch (err) {
        console.error(`Error removing stale staging directory for ${pluginDir}:`, err);
      }
    }

    // Clean up the lock file of the recovered transaction.
    try {
      fs.rmSync(lockFile, { force: true });
    } catch {
      // Ignore: the lock file may already be gone.
    }
  }

  // Remove lock files left behind by transactions whose directories are
  // already gone, but leave locks owned by live processes untouched.
  for (const entry of entries) {
    if (entry.isDirectory()) {
      continue;
    }

    if (!UPDATE_TXN_LOCK_PATTERN.exec(entry.name)) {
      continue;
    }

    const lockFile = path.join(txnRoot, entry.name);
    if (!isActiveTransaction(lockFile)) {
      try {
        fs.rmSync(lockFile, { force: true });
      } catch {
        // Ignore: the lock file may already be gone.
      }
    }
  }

  // Remove the transaction directory if it is now empty.
  try {
    fs.rmdirSync(txnRoot);
  } catch {
    // Ignore: the directory either does not exist or still has content.
  }
}

export class PluginManager {
  /**
   * Installs a plugin from the specified URL.
   * @param {string} URL - The URL of the plugin to install.
   * @param {string} [destinationFolder=defaultUserPluginsDir()] - The folder where the plugin will be installed.
   * @param {string} [headlampVersion=""] - The version of Headlamp for compatibility checking.
   * @param {function} [progressCallback=null] - Optional callback for progress updates.
   * @param {AbortSignal} [signal=null] - Optional AbortSignal for cancellation.
   * @returns {Promise<void>} A promise that resolves when the installation is complete.
   */
  static async install(
    URL: string,
    destinationFolder: string = defaultUserPluginsDir(),
    headlampVersion: string = '',
    progressCallback: null | ProgressCallback = null,
    signal: AbortSignal | null = null
  ) {
    let pluginInfo: ArtifactHubHeadlampPkg | undefined = undefined;
    try {
      pluginInfo = await fetchPluginInfo(URL, progressCallback, signal);
    } catch (e) {
      if (progressCallback) {
        progressCallback({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      } else {
        throw e;
      }
    }
    if (pluginInfo) {
      return this.installFromPluginPkg(
        pluginInfo,
        destinationFolder,
        headlampVersion,
        progressCallback,
        signal
      );
    }
  }

  /**
   * Installs a plugin from the given plugin data.
   * @param {PluginData} pluginData - The plugin data from which to install the plugin.
   * @param {string} [destinationFolder=defaultUserPluginsDir()] - The folder where the plugin will be installed.
   * @param {string} [headlampVersion=""] - The version of Headlamp for compatibility checking.
   * @param {function} [progressCallback=null] - Optional callback for progress updates.
   * @param {AbortSignal} [signal=null] - Optional AbortSignal for cancellation.
   * @returns {Promise<void>} A promise that resolves when the installation is complete.
   */
  static async installFromPluginPkg(
    pluginData: ArtifactHubHeadlampPkg,
    destinationFolder = defaultUserPluginsDir(),
    headlampVersion = '',
    progressCallback: null | ProgressCallback = null,
    signal: AbortSignal | null = null
  ) {
    try {
      const [name, tempFolder] = await downloadExtractArchive(
        pluginData,
        headlampVersion,
        progressCallback,
        signal
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

      // Add plugin bin directories to PATH
      if (validPluginBinFolder(path.basename(name))) {
        const binPath = path.join(destinationFolder, path.basename(name), 'bin');
        addToPath([binPath], 'installed plugin');
      }
    } catch (e) {
      if (progressCallback) {
        progressCallback({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      } else {
        throw e;
      }
    }
  }

  // progress function type that takes ProgressResp as argument and returns void
  // type ProgressCallback = (progress: ProgressResp) => void;
  /**
   * Updates an installed plugin to the latest version.
   * @param {string} pluginName - The name of the plugin to update.
   * @param {string} [destinationFolder=defaultUserPluginsDir()] - The folder where the plugin is installed.
   * @param {string} [headlampVersion=""] - The version of Headlamp for compatibility checking.
   * @param {null | ProgressCallback} [progressCallback=null] - Optional callback for progress updates.
   * @param {AbortSignal} [signal=null] - Optional AbortSignal for cancellation.
   * @returns {Promise<void>} A promise that resolves when the update is complete.
   */
  static async update(
    pluginName: string,
    destinationFolder: string = defaultUserPluginsDir(),
    headlampVersion: string = '',
    progressCallback: null | ProgressCallback = null,
    signal: AbortSignal | null = null
  ): Promise<void> {
    try {
      // @todo: should list call take progressCallback?
      const installedPlugins = PluginManager.list(destinationFolder);
      if (!installedPlugins) {
        throw new Error('InstalledPlugins not found');
      }
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
      // Keep semver out of the main-process heap until a plugin update is requested.
      const { default: semver } = await import('semver');

      if (semver.lte(latestVersion, currentVersion)) {
        throw new Error('No updates available');
      }

      // eslint-disable-next-line no-unused-vars
      const [_, tempFolder] = await downloadExtractArchive(
        pluginData,
        headlampVersion,
        progressCallback,
        signal
      );

      // sleep(2000);  // comment out for testing

      // create the destination folder if it doesn't exist
      if (!fs.existsSync(destinationFolder)) {
        fs.mkdirSync(destinationFolder, { recursive: true });
      }

      // Stage the new content alongside the existing plugin directory so
      // a failure during the move does not leave the plugin in a broken
      // state. The individual rename from the staging directory to the real
      // plugin directory is atomic when both reside on the same filesystem,
      // but the swap as a whole is not: the plugin directory is briefly
      // absent between the two renames. A crash in that window is repaired
      // by recoverInterruptedUpdate() on the next app startup or plugin
      // listing. Transaction directories live under a dedicated
      // `.headlamp-txn` subdirectory with a random id, so recovery never
      // mistakes a real plugin directory (e.g. `foo.backup` or
      // `foo.staging.<id>`) for a transaction.
      const txnId = crypto.randomBytes(8).toString('hex');
      const txnRoot = path.join(destinationFolder, UPDATE_TXN_DIR_NAME);
      const stagingDir = path.join(txnRoot, `${plugin.folderName}.staging.${txnId}`);
      const backupDir = path.join(txnRoot, `${plugin.folderName}.backup.${txnId}`);
      const lockFile = path.join(txnRoot, `${txnId}${UPDATE_TXN_LOCK_SUFFIX}`);

      // The transaction directory is reserved for update transactions; if a
      // plugin directory occupies its name, refuse rather than mixing the two.
      if (fs.existsSync(path.join(txnRoot, 'package.json'))) {
        throw new Error(
          `Cannot update plugin: '${UPDATE_TXN_DIR_NAME}' is occupied by a plugin directory`
        );
      }

      fs.mkdirSync(txnRoot, { recursive: true });

      try {
        // Mark the transaction as active so recovery never treats it as an
        // interrupted one while this process is still working on it.
        fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid }));

        if (fs.existsSync(stagingDir)) {
          fs.rmSync(stagingDir, { recursive: true, force: true });
        }
        fs.mkdirSync(stagingDir, { recursive: true });

        moveDirs(tempFolder, stagingDir);

        if (fs.existsSync(backupDir)) {
          fs.rmSync(backupDir, { recursive: true, force: true });
        }

        if (fs.existsSync(pluginDir)) {
          fs.renameSync(pluginDir, backupDir);
        }

        try {
          fs.renameSync(stagingDir, pluginDir);
        } catch (err) {
          // Roll the previous version back so the update failure leaves the
          // plugin usable. A rollback failure must not mask the original
          // error, so log it and rethrow the original one.
          try {
            if (fs.existsSync(backupDir)) {
              fs.renameSync(backupDir, pluginDir);
            }
          } catch (rollbackErr) {
            console.error(`Error rolling back backup directory ${backupDir}:`, rollbackErr);
          }
          throw err;
        }

        if (fs.existsSync(backupDir)) {
          try {
            fs.rmSync(backupDir, { recursive: true, force: true });
          } catch (err) {
            console.error(`Error cleaning up backup directory ${backupDir}:`, err);
          }
        }
      } finally {
        if (fs.existsSync(stagingDir)) {
          try {
            fs.rmSync(stagingDir, { recursive: true, force: true });
          } catch (err) {
            console.error(`Error cleaning up staging directory ${stagingDir}:`, err);
          }
        }
        // The transaction is done; release its lock.
        try {
          fs.rmSync(lockFile, { force: true });
        } catch (err) {
          console.error(`Error cleaning up transaction lock file ${lockFile}:`, err);
        }
        // Remove the transaction directory if it is now empty.
        try {
          fs.rmdirSync(txnRoot);
        } catch {
          // Ignore: the directory either does not exist or still has content.
        }
      }

      if (progressCallback) {
        progressCallback({ type: 'success', message: 'Plugin Updated' });
      }
    } catch (e) {
      if (progressCallback) {
        progressCallback({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      } else {
        throw e;
      }
    }
  }

  /**
   * Uninstalls a plugin from the specified folder.
   * @param {string} name - The name of the plugin to uninstall.
   * @param {string} [folder=defaultUserPluginsDir()] - The folder where the plugin is installed.
   * @param {function} [progressCallback=null] - Optional callback for progress updates.
   * @returns {void}
   */
  static uninstall(
    name: string,
    folder = defaultUserPluginsDir(),
    progressCallback: null | ProgressCallback = null
  ) {
    try {
      // @todo: should list call take progressCallback?
      const installedPlugins = PluginManager.list(folder);
      if (!installedPlugins) {
        throw new Error('InstalledPlugins not found');
      }
      const plugin = installedPlugins.find(p => p.pluginName === name);
      if (!plugin) {
        throw new Error('Plugin not found');
      }

      const pluginDir = path.join(folder, plugin.folderName);
      if (!checkValidPluginFolder(pluginDir)) {
        throw new Error('Invalid plugin folder');
      }

      if (fs.existsSync(pluginDir)) {
        fs.rmSync(pluginDir, { recursive: true, force: true });
      } else {
        throw new Error('Plugin not found');
      }
      if (progressCallback) {
        progressCallback({ type: 'success', message: 'Plugin Uninstalled' });
      }
    } catch (e) {
      if (progressCallback) {
        progressCallback({ type: 'error', message: e instanceof Error ? e.message : String(e) });
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
  static list(folder = defaultPluginsDir(), progressCallback: null | ProgressCallback = null) {
    try {
      const pluginsData: PluginData[] = [];

      // Restore plugins left broken by an update that crashed mid-swap.
      recoverInterruptedUpdate(folder);

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
        progressCallback({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      } else {
        throw e;
      }
    }
  }

  static async fetchPluginInfo(
    URL: string,
    options: { progressCallback?: null | ProgressCallback; signal?: AbortSignal | null } = {}
  ) {
    const { progressCallback = null, signal = null } = options;
    return fetchPluginInfo(URL, progressCallback, signal);
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
function validatePluginName(pluginName: string): boolean {
  const invalidPattern = /[\/\\]|(\.\.)/;
  return !invalidPattern.test(pluginName);
}

/**
 * @param {string} archiveURL - the one to validate
 * @returns true if the archiveURL looks good.
 */
function validateArchiveURL(archiveURL: string): boolean {
  const githubRegex = /^https:\/\/github\.com\/[^/]+\/[^/]+\/(releases|archive)\/.*$/;
  const bitbucketRegex = /^https:\/\/bitbucket\.org\/[^/]+\/[^/]+\/(downloads|get)\/.*$/;
  const gitlabRegex = /^https:\/\/gitlab\.com\/[^/]+\/[^/]+\/(-\/archive|releases)\/.*$/;
  // For testing purposes, we allow localhost URLs.
  const localRegex = /^https?:\/\/localhost(:\d+)?\/.*$/;

  // @todo There is a test plugin at https://github.com/yolossn/headlamp-plugins/
  // need to move that somewhere else, or test differently.

  const urlGood =
    githubRegex.test(archiveURL) ||
    bitbucketRegex.test(archiveURL) ||
    gitlabRegex.test(archiveURL) ||
    archiveURL.startsWith('https://github.com/yolossn/headlamp-plugins/');

  if (process.env.NODE_ENV === 'test') {
    return urlGood || localRegex.test(archiveURL);
  }
  return urlGood;
}

/**
 * Downloads and extracts a plugin archive from the specified plugin package.
 * @param pluginInfo - The plugin package data.
 * @param headlampVersion - The version of Headlamp for compatibility checking.
 * @param progressCallback - A callback function for reporting progress.
 * @param signal - An optional AbortSignal for cancellation.
 * @returns {Promise<[string, string]>} A promise that resolves to an array containing the plugin name and temporary folder path.
 */
async function downloadExtractArchive(
  pluginInfo: ArtifactHubHeadlampPkg,
  headlampVersion: string,
  progressCallback: ProgressCallback | null,
  signal: AbortSignal | null
): Promise<[string, string]> {
  // fetch plugin metadata
  if (signal && signal.aborted) {
    throw new Error('Download cancelled');
  }

  const pluginName = pluginInfo.name;
  if (!validatePluginName(pluginName)) {
    throw new Error('Invalid plugin name');
  }

  // Check if the plugin is compatible with the current Headlamp version
  if (headlampVersion) {
    // Compatibility checks are optional, so load semver only when one is required.
    const { default: semver } = await import('semver');
    if (progressCallback) {
      progressCallback({ type: 'info', message: 'Checking compatibility with Headlamp version' });
    }
    if (semver.satisfies(headlampVersion, pluginInfo.versionCompat)) {
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

  // Create temporary folder for extraction
  const tempDir = await fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-plugin-temp-'));
  // Defaulting to '' should never happen if recursive is true. So this is for the type
  // checker only.
  const tempFolder = fs.mkdirSync(path.join(tempDir, pluginName), { recursive: true }) ?? '';

  // First, download and extract the main archive
  if (progressCallback) {
    progressCallback({ type: 'info', message: 'Downloading main plugin archive' });
  }

  await downloadAndExtractSingleArchive(
    pluginInfo.archiveURL,
    pluginInfo.archiveChecksum,
    tempFolder,
    progressCallback,
    signal
  );

  await downloadExtraFiles(pluginInfo.extraFiles, tempFolder, progressCallback, signal);

  // Add artifacthub metadata to the plugin
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
 * Gets the platform-specific extra files that match the current platform and architecture.
 * Also returns the current platform and architecture as a string.
 *
 * @param extraFiles - The extra files to filter.
 * @returns An object containing the current platform and architecture as a string, and the matching extra files.
 */
export function getMatchingExtraFiles(extraFiles: ArtifactHubHeadlampPkg['extraFiles']): {
  currentArchString: string;
  matchingExtraFiles: ExtraFile[];
} {
  const currentPlatform = os.platform();
  const currentArch = os.arch();
  const currentArchString = `${currentPlatform}/${currentArch}`;

  return {
    currentArchString: currentArchString,
    matchingExtraFiles: Object.values(extraFiles || {}).filter(
      file => file.arch.toLowerCase() === currentArchString.toLowerCase()
    ),
  };
}

/**
 * Downloads and extracts platform-specific extra files if they match the current platform and architecture.
 *
 * @param extraFiles - The extra files to download and extract. @see ExtraFile
 * @param extractFolder - Folder where files should be extracted
 * @param progressCallback - Callback for progress updates
 * @param signal - Signal for cancellation
 */
async function downloadExtraFiles(
  extraFiles: ArtifactHubHeadlampPkg['extraFiles'],
  extractFolder: string,
  progressCallback: null | ProgressCallback,
  signal: AbortSignal | null
): Promise<void> {
  if (!extraFiles || Object.keys(extraFiles).length === 0) {
    return;
  }
  const { matchingExtraFiles, currentArchString } = getMatchingExtraFiles(extraFiles);

  if (matchingExtraFiles.length === 0) {
    if (progressCallback) {
      progressCallback({
        type: 'info',
        message: `No extra files found for platform ${currentArchString}`,
      });
    }
    return;
  }

  // Make sure bin directory exists
  const binDir = path.join(extractFolder, 'bin');
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  // Download and extract each matching file
  for (const file of matchingExtraFiles) {
    if (signal && signal.aborted) {
      throw new Error('Download cancelled');
    }

    if (progressCallback) {
      progressCallback({
        type: 'info',
        message: `Downloading platform-specific file for ${file.arch}: ${path.basename(file.url)}`,
      });
    }

    try {
      await downloadAndExtractSingleArchive(
        file.url,
        file.checksum,
        binDir,
        progressCallback,
        signal,
        0 // tarStrip
      );
    } catch (e) {
      if (progressCallback) {
        progressCallback({
          type: 'error',
          message: `Failed to download extra file ${file.url}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        });
      } else {
        throw e;
      }
    }

    // move the files to the correct output location
    for (const value of Object.values(file.output)) {
      if (!value.output || !value.input || value.input === value.output) {
        continue;
      }
      let outputFile = path.join(binDir, value.output);
      // If on Windows, ensure that the output file ends with .exe
      // For example, minikube should be minikube.exe
      // If the extra file is a .js file, we do not add .exe
      if (os.platform() === 'win32' && !value.output.endsWith('.js')) {
        outputFile = path.join(binDir, value.output) + '.exe';
      }

      const inputFile = path.join(binDir, value.input);
      if (inputFile === outputFile) {
        continue;
      }

      fs.copyFileSync(inputFile, outputFile);
      fs.rmSync(inputFile);

      // remove the input file folder... if it's empty
      const inputDir = path.dirname(inputFile);
      if (fs.readdirSync(inputDir).length === 0) {
        fs.rmSync(inputDir);
      }

      if (progressCallback) {
        progressCallback({
          type: 'info',
          message: `Moved platform-specific file to ${outputFile}`,
        });
      }
    }
  }

  if (progressCallback) {
    progressCallback({
      type: 'info',
      message: `Downloaded ${matchingExtraFiles.length} extra files for ${currentArchString}`,
    });
  }
}

/**
 * Downloads and extracts a single archive file.
 *
 * Supports both tar.gz archives and plain files (e.g., binaries).
 *
 * @param archiveURL - URL of the archive or file to download
 * @param checksum - Expected checksum of the archive or file
 * @param extractFolder - Folder where the archive or file should be extracted/saved
 * @param progressCallback - Callback for progress updates
 * @param signal - Signal for cancellation
 * @param tarStrip - Number of leading path components to strip from the archive (only for tar.gz)
 */
async function downloadAndExtractSingleArchive(
  archiveURL: string,
  archiveChecksum: string,
  extractFolder: string,
  progressCallback: null | ProgressCallback,
  signal: AbortSignal | null,
  tarStrip = 1
): Promise<void> {
  if (!validateArchiveURL(archiveURL)) {
    throw new Error('Invalid plugin/archive-url:' + archiveURL);
  }

  if (!archiveURL || !archiveChecksum) {
    throw new Error('Invalid plugin metadata. Please check the plugin details.');
  }

  let checksum = archiveChecksum;
  if (checksum.startsWith('sha256:') || checksum.startsWith('SHA256:')) {
    checksum = checksum.replace('sha256:', '');
    checksum = checksum.replace('SHA256:', '');
  }

  if (signal && signal.aborted) {
    throw new Error('Download cancelled');
  }

  // await sleep(4000); // comment out for testing
  let archResponse: Awaited<ReturnType<typeof fetch>>;

  try {
    archResponse = await fetch(archiveURL, { redirect: 'follow', signal });
  } catch (err) {
    const tlsCode = extractTlsErrorCode(err, TLS_ERROR_CODES);
    if (tlsCode) {
      throw new Error(
        `TLS certificate verification failed (${tlsCode}). This may be due to a corporate TLS-inspecting proxy. ` +
          'Ensure the proxy root CA is trusted by your OS certificate store, or configure a custom CA bundle (settings.json: customCAPath).',
        { cause: err }
      );
    }
    throw new Error('Failed to fetch archive. Please check the URL and your network connection.');
  }

  if (!archResponse.ok) {
    throw new Error(`Failed to download file. Status code: ${archResponse.status}`);
  }

  if (signal && signal.aborted) {
    throw new Error('Download cancelled');
  }

  const archChunks: Uint8Array[] = [];
  let archBufferLength = 0;

  if (!archResponse.body) {
    throw new Error('Download empty');
  }

  // @ts-ignore this code is using Node.js stream API, and it works.
  for await (const chunk of archResponse.body) {
    archChunks.push(chunk);
    archBufferLength += chunk.length;
  }

  const archBuffer = Buffer.concat(archChunks, archBufferLength);

  const computedChecksum = crypto.createHash('sha256').update(archBuffer).digest('hex');
  if (computedChecksum !== checksum) {
    throw new Error('Checksum mismatch.');
  }

  if (signal && signal.aborted) {
    throw new Error('Download cancelled');
  }

  // Determine if this is a tar.gz archive or a plain file
  const isTarGz =
    archiveURL.endsWith('.tar.gz') ||
    archiveURL.endsWith('.tgz') ||
    archiveURL.endsWith('.tar') ||
    archiveURL.includes('.tar.gz?') ||
    archiveURL.includes('.tgz?') ||
    archiveURL.includes('.tar?');

  if (isTarGz) {
    // Keep tar's module graph unloaded until an archive actually needs extraction.
    const tar = await import('tar');
    if (progressCallback) {
      progressCallback({
        type: 'info',
        message: 'Extracting plugin',
      });
    }
    // Extract the archive
    const archStream = new stream.PassThrough();
    archStream.end(archBuffer);

    const extractStream: stream.Writable = archStream.pipe(zlib.createGunzip()).pipe(
      tar.extract({
        cwd: extractFolder,
        strip: tarStrip,
        sync: true,
      }) as unknown as stream.Writable
    );

    await new Promise<void>((resolve, reject) => {
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
      progressCallback({ type: 'info', message: 'Plugin extracted' });
    }
  } else {
    // Only allow safe filenames (no path traversal, no absolute paths)
    // Note: we also have an allow list of trusted domains, so this is just an extra check.
    const fileName = path.basename(archiveURL.split('?')[0]);
    if (
      fileName.includes('..') ||
      fileName.startsWith('/') ||
      fileName.startsWith('\\') ||
      fileName === '' ||
      fileName === '.' ||
      fileName === '..'
    ) {
      throw new Error('Invalid file name in archive URL');
    }
    const outPath = path.join(extractFolder, fileName);

    // Ensure the output path is within the extractFolder
    const resolvedOutPath = path.resolve(outPath);
    const resolvedExtractFolder = path.resolve(extractFolder);
    if (!resolvedOutPath.startsWith(resolvedExtractFolder + path.sep)) {
      throw new Error('Attempted path traversal in file name');
    }

    if (progressCallback) {
      progressCallback({
        type: 'info',
        message: `Saving file to ${outPath}`,
      });
    }

    fs.writeFileSync(outPath, archBuffer, { mode: 0o755 });

    if (progressCallback) {
      progressCallback({ type: 'info', message: 'File downloaded' });
    }
  }
}

/**
 * Converts annotations input into a nested JavaScript object structure.
 * @param annotations - A record of annotations with path-style keys.
 * @returns A nested JavaScript object structure.
 */
function convertAnnotations(annotations: Record<string, string>): Record<string, any> {
  const result: Record<string, any> = {};

  for (const key in annotations) {
    const value = annotations[key];
    const parts = key.split('/');
    let current = result;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current[part] = value;
      } else {
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }
    }
  }

  return result;
}

/**
 * Extracts the extra-files part from the converted annotations.
 * @param annotations - A record of annotations with path-style keys.
 * @returns The extra-files part of the nested JavaScript object structure.
 */
export function getExtraFiles(
  annotations: Record<string, string>
): ArtifactHubHeadlampPkg['extraFiles'] | undefined {
  const converted = convertAnnotations(annotations);

  const extraFiles: ArtifactHubHeadlampPkg['extraFiles'] =
    converted?.headlamp?.plugin?.['extra-files'];
  if (!extraFiles) {
    return undefined;
  }

  // Validate the input and output.
  // Check if any of the extra files output.key.output's have anything dangerous.
  // For example '..' in the path and starting with / or \
  for (const file of Object.values(extraFiles)) {
    for (const value of Object.values(file.output)) {
      if (
        value.output.startsWith('..') ||
        value.output.startsWith('/') ||
        value.output.startsWith('\\')
      ) {
        throw new Error(`Invalid extra file output path, ${value.output}`);
      }
      if (
        value.input.startsWith('..') ||
        value.input.startsWith('/') ||
        value.input.startsWith('\\')
      ) {
        throw new Error(`Invalid extra file input path, ${value.input}`);
      }
    }
  }

  // Validate URLs. Only allow downloads from github.com/kubernetes/minikube for now.
  for (const file of Object.values(extraFiles)) {
    // For testing purposes, we allow localhost URLs.
    const underTest = process.env.NODE_ENV === 'test' && file.url.includes('localhost');
    const validURL =
      file.url &&
      (file.url.startsWith('https://github.com/kubernetes/minikube/releases/download/') ||
        file.url.startsWith('https://github.com/crc-org/vfkit/releases/download/'));

    if (!underTest && !validURL) {
      throw new Error(`Invalid URL, ${file.url}`);
    }
  }

  return converted.headlamp.plugin['extra-files'];
}

/**
 * Fetches plugin metadata from the specified URL.
 * @param {string} URL - The URL to fetch plugin metadata from.
 * @param {function} progressCallback - A callback function for reporting progress.
 * @param {AbortSignal} signal - An optional AbortSignal for cancellation.
 * @returns {Promise<ArtifactHubHeadlampPkg>} A promise that resolves to the fetched plugin metadata.
 */
async function fetchPluginInfo(
  URL: string,
  progressCallback: null | ProgressCallback,
  signal: AbortSignal | null
): Promise<ArtifactHubHeadlampPkg> {
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
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(apiURL, { redirect: 'follow', signal });
    } catch (err) {
      const tlsCode = extractTlsErrorCode(err, TLS_ERROR_CODES);
      if (tlsCode) {
        throw new Error(
          `TLS certificate verification failed (${tlsCode}). This may be due to a corporate TLS-inspecting proxy. ` +
            'Ensure the proxy root CA is trusted by your OS certificate store, or configure a custom CA bundle (settings.json: customCAPath).',
          { cause: err }
        );
      }
      throw new Error('Failed to fetch plugin metadata. Please check your network connection.');
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const pkgResponse = await response.json();
    const pkg: ArtifactHubHeadlampPkg = {
      name: pkgResponse.name,
      display_name: pkgResponse.display_name,
      version: pkgResponse.version,
      repository: pkgResponse.repository,
      archiveURL: pkgResponse.data['headlamp/plugin/archive-url'],
      archiveChecksum: pkgResponse.data['headlamp/plugin/archive-checksum'],
      distroCompat: pkgResponse.data['headlamp/plugin/distro-compat'],
      versionCompat: pkgResponse.data['headlamp/plugin/version-compat'],
    };

    const extraFiles = getExtraFiles(pkgResponse.data);

    if (extraFiles) {
      pkg.extraFiles = extraFiles;
      if (progressCallback) {
        progressCallback({
          type: 'info',
          message: `Found ${Object.keys(pkg.extraFiles)!.length} platform-specific extra files`,
        });
      }
    }

    return pkg;
  } catch (e) {
    if (progressCallback) {
      progressCallback({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    }

    throw e;
  }
}

/**
 * Checks if a given folder is a valid Headlamp plugin folder.
 * A valid plugin folder must exist, contain 'main.js' and 'package.json' files,
 * and the 'package.json' file must have 'isManagedByHeadlampPlugin' set to true.
 *
 * @param folder - The path to the folder to check.
 * @returns True if the folder is a valid Headlamp plugin folder, false otherwise.
 */
function checkValidPluginFolder(folder: string): boolean {
  if (!fs.existsSync(folder)) {
    return false;
  }
  const mainJsPath = path.join(folder, 'main.js');
  const packageJsonPath = path.join(folder, 'package.json');
  if (!fs.existsSync(mainJsPath) || !fs.existsSync(packageJsonPath)) {
    return false;
  }
  const packageJSON = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (packageJSON.isManagedByHeadlampPlugin) {
    return true;
  }
  return false;
}

/**
 * Returns the default directory where Headlamp plugins are installed.
 * If the data path exists, it is used as the base directory.
 * Otherwise, the config path is used as the base directory.
 * The 'plugins' subdirectory of the base directory is returned.
 *
 * @returns {string} The path to the default plugins directory.
 */
export function defaultPluginsDir(): string {
  return path.join(defaultAppDataDir(), 'plugins');
}

/**
 * Returns the default directory where user-installed plugins are stored.
 * If the data path exists, it is used as the base directory.
 * Otherwise, the config path is used as the base directory.
 * The 'user-plugins' subdirectory of the base directory is returned.
 *
 * @returns {string} The path to the default user-plugins directory.
 */
export function defaultUserPluginsDir(): string {
  return path.join(defaultAppDataDir(), 'user-plugins');
}

/**
 * Returns the default directory for app-managed kubeconfig files.
 * This matches the backend's platform defaults so existing managed clusters
 * remain available when the desktop app starts passing an explicit directory.
 *
 * @returns The backend-compatible kubeconfigs directory for the application.
 */
export function defaultKubeConfigsDir(): string {
  const paths = envPaths(appConfigDirName, { suffix: '' });
  const configDir = process.platform === 'darwin' ? paths.data : paths.config;
  return path.join(configDir, 'kubeconfigs');
}

/**
 * Checks if a given folder is a valid plugin bin folder.
 *
 * @param {string} folder - The path to the folder to check. Should not include /bin in the path.
 * @returns {boolean} True if the folder is a valid plugin bin folder, false otherwise.
 */
function validPluginBinFolder(folder: string): boolean {
  // For now only allow "headlamp_minikubeprerelease" and "headlamp_minikube"
  return (
    folder === 'headlamp_minikube' ||
    folder === 'headlamp_minikubeprerelease' ||
    folder === 'azure-aks'
  );
}

/**
 * Collects bin directories from all installed plugins.
 *
 * @param pluginsDir - The directory containing plugins
 * @returns Array of plugin bin directory paths
 */
export function getPluginBinDirectories(pluginsDir: string): string[] {
  if (!fs.existsSync(pluginsDir)) {
    return [];
  }

  const binDirs: string[] = [];

  try {
    const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
    const pluginFolders = entries.filter(entry => entry.isDirectory());

    for (const pluginFolder of pluginFolders) {
      if (!validPluginBinFolder(pluginFolder.name)) {
        continue;
      }

      const binDir = path.join(pluginsDir, pluginFolder.name, 'bin');
      if (fs.existsSync(binDir)) {
        // Make sure binaries are executable
        if (process.platform !== 'win32') {
          try {
            const files = fs.readdirSync(binDir);
            for (const file of files) {
              const filePath = path.join(binDir, file);
              // Skip directories
              const stat = fs.statSync(filePath);
              if (stat.isDirectory()) {
                continue;
              }
              const currentMode = stat.mode & 0o777;
              if (currentMode !== 0o755) {
                console.log(`Setting executable permissions for ${filePath}`);
                fs.chmodSync(filePath, 0o755); // rwx r-x r-x
              }
            }
          } catch (err) {
            console.error(`Error setting executable permissions in ${binDir}:`, err);
          }
        }
        binDirs.push(binDir);
      }
    }
  } catch (err) {
    console.error(`Error scanning plugin directories in ${pluginsDir}:`, err);
  }

  return binDirs;
}

/**
 * Adds directories to the PATH environment variable
 *
 * @param dirs - Directories to add to PATH
 * @param description - Description for logging (e.g., "plugin", "bundled plugin")
 */
export function addToPath(dirs: string[], description: string): void {
  if (dirs.length === 0) return;

  const pathSeparator = process.platform === 'win32' ? ';' : ':';
  const existingPath = process.env.PATH || '';
  process.env.PATH = [...dirs, existingPath].join(pathSeparator);
  const message = `Added ${dirs.length} ${description} bin directories to PATH`;
  console.info(message);
}

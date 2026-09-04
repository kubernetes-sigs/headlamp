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
import { app } from 'electron';
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
  packageId: string;
  name: string;
  display_name: string;
  repository: {
    repositoryId: string;
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

/** Artifact Hub provenance expected for a managed plugin installation. */
export interface ArtifactHubPluginIdentity {
  /** Artifact Hub repository name recorded by the installer. */
  repository: string;
  /** Artifact Hub package name within the repository. */
  package: string;
  /** Immutable Artifact Hub package identifier, when the policy requires one. */
  packageId?: string;
  /** Immutable Artifact Hub repository identifier, when the policy requires one. */
  repositoryId?: string;
}

interface PluginInstallationReceipt extends Required<ArtifactHubPluginIdentity> {
  inventoryPath: string;
  bundleName: string;
  files: Record<string, string>;
}

interface PluginInstallationReceiptStore {
  version: 1;
  receipts: PluginInstallationReceipt[];
}

/**
 * Package-local consistency metadata for a managed plugin.
 *
 * Headlamp records this after checksum-verifying and installing an Artifact Hub archive. It detects
 * accidental corruption and changes that leave the recorded digests untouched. Because the plugin
 * bundle contains both the files and this metadata, it does not authenticate publisher identity or
 * resist an actor who can replace or pre-position the whole bundle and recompute the metadata.
 */
interface PluginPackageIntegrity {
  version: 1;
  executables?: Record<string, string>;
}

const PLUGIN_DATA_PATH = app?.getPath('userData') || path.join(os.tmpdir(), 'headlamp-testing');
export const PREPARED_PLUGIN_EXECUTABLES_PATH = path.join(
  PLUGIN_DATA_PATH,
  'prepared-plugin-executables'
);
export const PREPARED_PLUGIN_SCRIPTS_PATH = path.join(PLUGIN_DATA_PATH, 'prepared-plugin-scripts');
export const PLUGIN_INSTALLATION_RECEIPTS_PATH = path.join(
  PLUGIN_DATA_PATH,
  'plugin-installation-receipts.json'
);

/**
 * Computes the SHA-256 digest of a plugin file.
 *
 * @param file - File to hash.
 * @returns The lowercase hexadecimal digest.
 */
function hashPluginFile(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Computes the stable digest of package.json without its self-referential integrity metadata.
 *
 * Excluding `headlampPluginIntegrity` allows receipts to be updated without invalidating the
 * package digest. Consequently, this digest is a consistency check, not authentication of the
 * package-local receipt.
 *
 * @param packageJson - Parsed plugin package.json.
 * @returns The lowercase hexadecimal SHA-256 digest.
 */
function hashPluginPackage(packageJson: Record<string, unknown>): string {
  const contents = { ...packageJson };
  delete contents.headlampPluginIntegrity;
  return crypto.createHash('sha256').update(JSON.stringify(contents)).digest('hex');
}

/**
 * Builds a deterministic map of relative plugin file paths to SHA-256 digests.
 *
 * @param bundlePath - Canonical plugin bundle directory.
 * @returns Digests for every regular file in the bundle.
 * @throws When the bundle contains a symbolic link or non-file entry.
 */
async function pluginBundleFiles(bundlePath: string): Promise<Record<string, string>> {
  const files: Record<string, string> = Object.create(null);

  /** Visits one bundle directory and adds its regular files to the digest map. */
  async function visit(directory: string): Promise<void> {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const entryPath = path.join(directory, entry.name);
      const stat = fs.lstatSync(entryPath);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
        throw new Error(`Unsupported plugin file: ${entry.name}`);
      }
      if (stat.isDirectory()) {
        await visit(entryPath);
      } else {
        const relativePath = path.relative(bundlePath, entryPath).split(path.sep).join('/');
        files[relativePath] =
          relativePath === 'package.json'
            ? hashPluginPackage(JSON.parse(await fs.promises.readFile(entryPath, 'utf8')))
            : await hashPluginFile(entryPath);
      }
    }
  }
  await visit(bundlePath);
  return files;
}

/**
 * Reads and structurally validates package-local plugin integrity metadata.
 *
 * This validates metadata shape only; it does not authenticate who wrote the metadata.
 *
 * @param bundlePath - Plugin bundle containing package.json.
 * @returns Valid integrity metadata, or undefined when missing or malformed.
 */
function readPluginIntegrity(bundlePath: string): PluginPackageIntegrity | undefined {
  try {
    const bundle = fs.realpathSync(bundlePath);
    const packagePath = path.join(bundle, 'package.json');
    if (fs.lstatSync(packagePath).isSymbolicLink()) return undefined;
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const integrity = packageJson.headlampPluginIntegrity as PluginPackageIntegrity | undefined;
    const validFiles = (files: Record<string, string> | undefined) =>
      files &&
      Object.entries(files).every(([file, digest]) => file !== '' && /^[a-f0-9]{64}$/.test(digest));
    if (integrity?.version !== 1) return undefined;
    if (integrity.executables && !validFiles(integrity.executables)) {
      return undefined;
    }
    return integrity;
  } catch {
    return undefined;
  }
}

/**
 * Atomically updates a plugin's package.json after rejecting a symbolic-link package file.
 *
 * @param bundlePath - Plugin bundle containing package.json.
 * @param update - Mutation to apply to the parsed package object.
 */
function updatePluginPackage(
  bundlePath: string,
  update: (packageJson: Record<string, unknown>) => void
): void {
  const bundle = fs.realpathSync(bundlePath);
  const packagePath = path.join(bundle, 'package.json');
  if (fs.lstatSync(packagePath).isSymbolicLink()) {
    throw new Error('Invalid plugin package.json');
  }
  const packageJson: Record<string, unknown> = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  update(packageJson);
  const temporaryFile = `${packagePath}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporaryFile, `${JSON.stringify(packageJson, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporaryFile, packagePath);
  } finally {
    fs.rmSync(temporaryFile, { force: true });
  }
}

/**
 * Merges package-local integrity metadata without discarding another receipt category.
 *
 * @param bundlePath - Plugin bundle containing package.json.
 * @param update - Installation or executable integrity fields to merge.
 */
function writePluginIntegrity(
  bundlePath: string,
  update: Partial<Omit<PluginPackageIntegrity, 'version'>>
): void {
  updatePluginPackage(bundlePath, packageJson => {
    packageJson.headlampPluginIntegrity = {
      ...readPluginIntegrity(bundlePath),
      ...update,
      version: 1,
    };
  });
}

/** Reads structurally valid installation receipts from app-owned state. */
function readPluginInstallationReceipts(receiptFile: string): PluginInstallationReceipt[] {
  try {
    const store = JSON.parse(
      fs.readFileSync(receiptFile, 'utf8')
    ) as PluginInstallationReceiptStore;
    if (store.version !== 1 || !Array.isArray(store.receipts)) return [];
    return store.receipts.filter(receipt => {
      const validFiles =
        receipt.files &&
        Object.entries(receipt.files).every(
          ([file, digest]) => file !== '' && /^[a-f0-9]{64}$/.test(digest)
        );
      return (
        typeof receipt.inventoryPath === 'string' &&
        path.isAbsolute(receipt.inventoryPath) &&
        typeof receipt.bundleName === 'string' &&
        receipt.bundleName !== '' &&
        typeof receipt.repository === 'string' &&
        typeof receipt.package === 'string' &&
        typeof receipt.packageId === 'string' &&
        typeof receipt.repositoryId === 'string' &&
        Boolean(validFiles)
      );
    });
  } catch {
    return [];
  }
}

/** Atomically replaces app-owned installation receipt state. */
function writePluginInstallationReceipts(
  receiptFile: string,
  receipts: PluginInstallationReceipt[]
): void {
  fs.mkdirSync(path.dirname(receiptFile), { recursive: true, mode: 0o700 });
  const temporaryFile = `${receiptFile}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporaryFile, `${JSON.stringify({ version: 1, receipts }, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
    fs.renameSync(temporaryFile, receiptFile);
  } finally {
    fs.rmSync(temporaryFile, { force: true });
  }
}

/**
 * Reads the app-owned installation receipt for one canonical bundle and Artifact Hub identity.
 *
 * The canonical inventory path and bundle directory are part of the authenticated lookup key, so
 * a receipt for one installed location cannot authorize a bundle copied or pre-positioned elsewhere.
 *
 * @param bundlePath - Installed plugin bundle.
 * @param identity - Artifact Hub identity expected by the caller.
 * @param receiptFile - App-owned receipt store.
 * @returns The matching receipt, or undefined when it is absent, malformed, or has different IDs.
 */
export function readPluginInstallationReceipt(
  bundlePath: string,
  identity: ArtifactHubPluginIdentity,
  receiptFile = PLUGIN_INSTALLATION_RECEIPTS_PATH
): PluginInstallationReceipt | undefined {
  const canonicalBundle = fs.realpathSync(bundlePath);
  const inventoryPath = path.dirname(canonicalBundle);
  const bundleName = path.basename(canonicalBundle);
  const receipt = readPluginInstallationReceipts(receiptFile).find(
    candidate => candidate.inventoryPath === inventoryPath && candidate.bundleName === bundleName
  );
  if (
    !receipt ||
    receipt.repository !== identity.repository ||
    receipt.package !== identity.package ||
    (identity.packageId !== undefined && receipt.packageId !== identity.packageId) ||
    (identity.repositoryId !== undefined && receipt.repositoryId !== identity.repositoryId)
  ) {
    return undefined;
  }
  return receipt;
}

/**
 * Records the current managed bundle contents and installer-supplied Artifact Hub identity.
 *
 * @param bundlePath - Installed plugin bundle.
 * @param identity - Artifact Hub identity obtained by the installation flow.
 * @param receiptFile - App-owned receipt store.
 * @throws When either identity field is not a UUID.
 */
export async function recordPluginInstallationIntegrity(
  bundlePath: string,
  identity: Required<ArtifactHubPluginIdentity>,
  receiptFile = PLUGIN_INSTALLATION_RECEIPTS_PATH
): Promise<void> {
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  const name = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
  if (
    !name.test(identity.repository) ||
    !name.test(identity.package) ||
    !uuid.test(identity.packageId) ||
    !uuid.test(identity.repositoryId)
  ) {
    throw new Error('Invalid Artifact Hub plugin identity');
  }
  const canonicalBundle = fs.realpathSync(bundlePath);
  const receipt: PluginInstallationReceipt = {
    ...identity,
    inventoryPath: path.dirname(canonicalBundle),
    bundleName: path.basename(canonicalBundle),
    files: await pluginBundleFiles(canonicalBundle),
  };
  const receipts = readPluginInstallationReceipts(receiptFile).filter(
    candidate =>
      candidate.inventoryPath !== receipt.inventoryPath ||
      candidate.bundleName !== receipt.bundleName
  );
  writePluginInstallationReceipts(receiptFile, [...receipts, receipt]);
}

/**
 * Checks a managed bundle against its app-owned receipt and expected Artifact Hub identity.
 *
 * Provenance decisions must never use package-local metadata: a pre-positioned bundle can rewrite
 * both its files and `package.json`. The receipt used here is created only by Headlamp's verified
 * install flow and stored outside plugin-controlled inventory, bound to its canonical location.
 *
 * @param bundlePath - Installed plugin bundle.
 * @param identity - Artifact Hub identity expected by the caller.
 * @param receiptFile - App-owned receipt store.
 * @returns Whether the receipt identity and all recorded file digests match.
 */
export async function verifyPluginInstallationIntegrity(
  bundlePath: string,
  identity: ArtifactHubPluginIdentity,
  receiptFile = PLUGIN_INSTALLATION_RECEIPTS_PATH
): Promise<boolean> {
  try {
    const canonicalBundle = fs.realpathSync(bundlePath);
    const receipt = readPluginInstallationReceipt(canonicalBundle, identity, receiptFile);
    if (!receipt) return false;
    const currentFiles = await pluginBundleFiles(canonicalBundle);
    const recordedPaths = Object.keys(receipt.files);
    return (
      Object.keys(currentFiles).length === recordedPaths.length &&
      recordedPaths.every(file => currentFiles[file] === receipt.files[file])
    );
  } catch {
    return false;
  }
}

/** Removes app-owned provenance for an uninstalled bundle. */
function removePluginInstallationReceipt(
  bundlePath: string,
  receiptFile = PLUGIN_INSTALLATION_RECEIPTS_PATH
): void {
  const canonicalBundle = fs.existsSync(bundlePath)
    ? fs.realpathSync(bundlePath)
    : path.resolve(bundlePath);
  const inventoryPath = path.dirname(canonicalBundle);
  const bundleName = path.basename(canonicalBundle);
  const receipts = readPluginInstallationReceipts(receiptFile);
  const retained = receipts.filter(
    receipt => receipt.inventoryPath !== inventoryPath || receipt.bundleName !== bundleName
  );
  if (retained.length !== receipts.length) {
    writePluginInstallationReceipts(receiptFile, retained);
  }
}

/**
 * Copies a receipted plugin script into a private directory and verifies the copied bytes.
 *
 * @param bundlePath - Installed plugin bundle.
 * @param scriptPath - Bundle-relative script path.
 * @param identity - Artifact Hub identity expected by the caller.
 * @param preparedRoot - App-managed root for one-time script copies.
 * @returns The prepared script path, or a non-sensitive failure reason.
 */
export async function preparePluginScript(
  bundlePath: string,
  scriptPath: string,
  identity: ArtifactHubPluginIdentity,
  preparedRoot = PREPARED_PLUGIN_SCRIPTS_PATH,
  receiptFile = PLUGIN_INSTALLATION_RECEIPTS_PATH
): Promise<{ ok: true; scriptPath: string } | { ok: false; reason: string }> {
  let preparedDirectory: string | undefined;
  try {
    const canonicalBundle = fs.realpathSync(bundlePath);
    const requestedScript = path.resolve(canonicalBundle, scriptPath);
    const canonicalScript = fs.realpathSync(requestedScript);
    const relativeScript = path.relative(canonicalBundle, canonicalScript);
    if (
      relativeScript === '' ||
      relativeScript === '..' ||
      relativeScript.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeScript) ||
      fs.lstatSync(requestedScript).isSymbolicLink()
    ) {
      return { ok: false, reason: 'unavailable-file' };
    }
    const receipt = readPluginInstallationReceipt(canonicalBundle, identity, receiptFile);
    const digest = receipt?.files[relativeScript.split(path.sep).join('/')];
    if (!digest) return { ok: false, reason: 'missing-receipt' };

    fs.mkdirSync(preparedRoot, { recursive: true, mode: 0o700 });
    preparedDirectory = fs.mkdtempSync(path.join(preparedRoot, 'run-'));
    const preparedScript = path.join(preparedDirectory, path.basename(canonicalScript));
    fs.copyFileSync(canonicalScript, preparedScript, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(preparedScript, 0o400);
    if (digest !== (await hashPluginFile(preparedScript))) {
      fs.rmSync(preparedDirectory, { recursive: true, force: true });
      return { ok: false, reason: 'digest-mismatch' };
    }
    return { ok: true, scriptPath: preparedScript };
  } catch {
    if (preparedDirectory) fs.rmSync(preparedDirectory, { recursive: true, force: true });
    return { ok: false, reason: 'unavailable-file' };
  }
}

/**
 * Removes a prepared script directory after validating that it belongs to the prepared root.
 *
 * @param scriptPath - Prepared script to remove.
 * @param preparedRoot - App-managed root for one-time script copies.
 * @throws When the script is not an immediate child of a prepared directory.
 */
export function removePreparedPluginScript(
  scriptPath: string,
  preparedRoot = PREPARED_PLUGIN_SCRIPTS_PATH
): void {
  const preparedDirectory = path.dirname(path.resolve(scriptPath));
  if (path.dirname(preparedDirectory) !== path.resolve(preparedRoot)) {
    throw new Error('Invalid prepared plugin script path');
  }
  fs.rmSync(preparedDirectory, { recursive: true, force: true });
}

/**
 * Resolves a bundle-relative executable without allowing links or bundle escapes.
 *
 * @param bundlePath - Installed plugin bundle.
 * @param executablePath - Platform-independent bundle-relative executable path.
 * @returns Canonical bundle and executable paths plus the receipt key.
 * @throws When the executable is unavailable, linked, or outside the bundle.
 */
function pluginExecutable(bundlePath: string, executablePath: string) {
  const bundle = fs.realpathSync(bundlePath);
  const requested = path.resolve(bundle, executablePath);
  const platformPath =
    process.platform === 'win32' && !fs.existsSync(requested) ? `${requested}.exe` : requested;
  const executable = fs.realpathSync(platformPath);
  const relative = path.relative(bundle, executable);
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative) ||
    fs.lstatSync(platformPath).isSymbolicLink()
  ) {
    throw new Error(`Invalid plugin executable path: ${executablePath}`);
  }
  return {
    bundle,
    executable,
    logicalPath: executablePath.split(path.sep).join('/'),
  };
}

/**
 * Records package-local digests for executables installed by the verified download flow.
 *
 * @param bundlePath - Installed plugin bundle.
 * @param executablePaths - Platform-independent bundle-relative executable paths.
 */
export async function recordPluginExecutableIntegrity(
  bundlePath: string,
  executablePaths: string[]
): Promise<void> {
  const files: Record<string, string> = {};
  let bundle = fs.realpathSync(bundlePath);
  for (const executablePath of executablePaths) {
    const resolved = pluginExecutable(bundle, executablePath);
    bundle = resolved.bundle;
    files[resolved.logicalPath] = await hashPluginFile(resolved.executable);
  }
  writePluginIntegrity(bundle, { executables: files });
}

/**
 * Verifies that an executable resolves to the expected bundle file and matches its recorded digest.
 *
 * The package-local digest detects replacement that leaves the receipt unchanged; it is not proof of
 * provenance when an actor can rewrite both the executable and its receipt.
 *
 * @param bundlePath - Installed plugin bundle.
 * @param executablePath - Platform-independent bundle-relative executable path.
 * @param absoluteExecutablePath - Absolute path selected for execution.
 * @returns Success or a non-sensitive failure reason.
 */
export async function verifyPluginExecutableIntegrity(
  bundlePath: string,
  executablePath: string,
  absoluteExecutablePath: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const resolved = pluginExecutable(bundlePath, executablePath);
    if (resolved.executable !== fs.realpathSync(absoluteExecutablePath)) {
      return { ok: false, reason: 'unavailable-executable' };
    }
    const digest = readPluginIntegrity(resolved.bundle)?.executables?.[resolved.logicalPath];
    if (!digest) return { ok: false, reason: 'missing-receipt' };
    return digest === (await hashPluginFile(resolved.executable))
      ? { ok: true }
      : { ok: false, reason: 'digest-mismatch' };
  } catch {
    return { ok: false, reason: 'unavailable-executable' };
  }
}

/**
 * Copies a receipted executable into a private directory and verifies the copied bytes.
 *
 * @param bundlePath - Installed plugin bundle.
 * @param executablePath - Platform-independent bundle-relative executable path.
 * @param absoluteExecutablePath - Absolute path selected for execution.
 * @param preparedRoot - App-managed root for one-time executable copies.
 * @returns The prepared executable path, or a non-sensitive failure reason.
 */
export async function preparePluginExecutable(
  bundlePath: string,
  executablePath: string,
  absoluteExecutablePath: string,
  preparedRoot = PREPARED_PLUGIN_EXECUTABLES_PATH
): Promise<{ ok: true; executablePath: string } | { ok: false; reason: string }> {
  let preparedDirectory: string | undefined;
  try {
    const resolved = pluginExecutable(bundlePath, executablePath);
    if (resolved.executable !== fs.realpathSync(absoluteExecutablePath)) {
      return { ok: false, reason: 'unavailable-executable' };
    }
    const digest = readPluginIntegrity(resolved.bundle)?.executables?.[resolved.logicalPath];
    if (!digest) return { ok: false, reason: 'missing-receipt' };
    fs.mkdirSync(preparedRoot, { recursive: true, mode: 0o700 });
    preparedDirectory = fs.mkdtempSync(path.join(preparedRoot, 'run-'));
    const preparedExecutable = path.join(preparedDirectory, path.basename(resolved.executable));
    fs.copyFileSync(resolved.executable, preparedExecutable, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(preparedExecutable, 0o500);
    if (digest !== (await hashPluginFile(preparedExecutable))) {
      fs.rmSync(preparedDirectory, { recursive: true, force: true });
      return { ok: false, reason: 'digest-mismatch' };
    }
    return { ok: true, executablePath: preparedExecutable };
  } catch {
    if (preparedDirectory) fs.rmSync(preparedDirectory, { recursive: true, force: true });
    return { ok: false, reason: 'unavailable-executable' };
  }
}

/**
 * Removes a prepared executable directory after validating that it belongs to the prepared root.
 *
 * @param executablePath - Prepared executable to remove.
 * @param preparedRoot - App-managed root for one-time executable copies.
 * @throws When the executable is not an immediate child of a prepared directory.
 */
export function removePreparedPluginExecutable(
  executablePath: string,
  preparedRoot = PREPARED_PLUGIN_EXECUTABLES_PATH
): void {
  const preparedDirectory = path.dirname(path.resolve(executablePath));
  if (path.dirname(preparedDirectory) !== path.resolve(preparedRoot)) {
    throw new Error('Invalid prepared plugin executable path');
  }
  fs.rmSync(preparedDirectory, { recursive: true, force: true });
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
      const [name, tempFolder, executablePaths] = await downloadExtractArchive(
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
      const bundlePath = path.join(destinationFolder, path.basename(name));
      moveDirs(tempFolder, bundlePath);
      try {
        await recordPluginExecutableIntegrity(bundlePath, executablePaths);
        await recordPluginInstallationIntegrity(bundlePath, {
          repository: pluginData.repository.name,
          package: pluginData.name,
          packageId: pluginData.packageId,
          repositoryId: pluginData.repository.repositoryId,
        });
      } catch (error) {
        fs.rmSync(bundlePath, { recursive: true, force: true });
        throw error;
      }
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
      const [_, tempFolder, executablePaths] = await downloadExtractArchive(
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

      const updateRoot = path.join(destinationFolder, '.headlamp-plugin-updates');
      fs.mkdirSync(updateRoot, { recursive: true });
      const backupDir = path.join(
        updateRoot,
        `${plugin.folderName}.update-backup-${crypto.randomBytes(8).toString('hex')}`
      );
      fs.renameSync(pluginDir, backupDir);
      try {
        moveDirs(tempFolder, pluginDir);
        await recordPluginExecutableIntegrity(pluginDir, executablePaths);
        await recordPluginInstallationIntegrity(pluginDir, {
          repository: pluginData.repository.name,
          package: pluginData.name,
          packageId: pluginData.packageId,
          repositoryId: pluginData.repository.repositoryId,
        });
      } catch (error) {
        fs.rmSync(pluginDir, { recursive: true, force: true });
        fs.renameSync(backupDir, pluginDir);
        throw error;
      }
      try {
        fs.rmSync(backupDir, { recursive: true, force: true });
      } catch (error) {
        console.warn('Failed to remove plugin update backup:', error);
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
        removePluginInstallationReceipt(pluginDir);
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
 * @returns The plugin name, temporary bundle path, and installed executable paths.
 * @throws When package validation, download, extraction, or executable installation fails.
 */
async function downloadExtractArchive(
  pluginInfo: ArtifactHubHeadlampPkg,
  headlampVersion: string,
  progressCallback: ProgressCallback | null,
  signal: AbortSignal | null
): Promise<[string, string, string[]]> {
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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-plugin-temp-'));
  const tempFolder = path.join(tempDir, pluginName);
  fs.mkdirSync(tempFolder, { recursive: true });

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

  const executablePaths = await downloadExtraFiles(
    pluginInfo.extraFiles,
    tempFolder,
    progressCallback,
    signal
  );

  updatePluginPackage(tempFolder, packageJson => {
    packageJson.artifacthub = {
      name: pluginName,
      title: pluginInfo.display_name,
      url: `https://artifacthub.io/packages/headlamp/${pluginInfo.repository.name}/${pluginName}`,
      version: pluginInfo.version,
      repoName: pluginInfo.repository.name,
      author: pluginInfo.repository.user_alias,
    };
    packageJson.isManagedByHeadlampPlugin = true;
  });

  return [pluginName, tempFolder, executablePaths];
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
 * @returns Platform-independent paths for the executables placed under the bundle's `bin` folder.
 * @throws When a matching extra file cannot be downloaded, verified, extracted, or moved.
 */
async function downloadExtraFiles(
  extraFiles: ArtifactHubHeadlampPkg['extraFiles'],
  extractFolder: string,
  progressCallback: null | ProgressCallback,
  signal: AbortSignal | null
): Promise<string[]> {
  if (!extraFiles || Object.keys(extraFiles).length === 0) {
    return [];
  }
  const { matchingExtraFiles, currentArchString } = getMatchingExtraFiles(extraFiles);

  if (matchingExtraFiles.length === 0) {
    if (progressCallback) {
      progressCallback({
        type: 'info',
        message: `No extra files found for platform ${currentArchString}`,
      });
    }
    return [];
  }

  const executablePaths = new Set<string>();

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
      if (!value.output || !value.input) {
        continue;
      }
      let outputFile = path.join(binDir, value.output);
      // If on Windows, ensure that the output file ends with .exe
      // For example, minikube should be minikube.exe
      // If the extra file is a .js file, we do not add .exe
      if (
        os.platform() === 'win32' &&
        !value.output.endsWith('.js') &&
        !value.output.endsWith('.exe')
      ) {
        outputFile = path.join(binDir, value.output) + '.exe';
      }

      const inputFile = path.join(binDir, value.input);
      if (inputFile !== outputFile) {
        fs.copyFileSync(inputFile, outputFile);
        fs.rmSync(inputFile);

        // remove the input file folder... if it's empty
        const inputDir = path.dirname(inputFile);
        if (inputDir !== binDir && fs.readdirSync(inputDir).length === 0) {
          fs.rmSync(inputDir);
        }
      }
      const logicalOutput =
        os.platform() === 'win32' && value.output.endsWith('.exe')
          ? value.output.slice(0, -'.exe'.length)
          : value.output;
      executablePaths.add(path.posix.join('bin', logicalOutput));

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
  return [...executablePaths];
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
      packageId: pkgResponse.package_id,
      name: pkgResponse.name,
      display_name: pkgResponse.display_name,
      version: pkgResponse.version,
      repository: {
        repositoryId: pkgResponse.repository.repository_id,
        name: pkgResponse.repository.name,
        user_alias: pkgResponse.repository.user_alias,
      },
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

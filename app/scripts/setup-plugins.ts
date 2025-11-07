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

import { globSync } from 'glob';
import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';
import * as tar from 'tar';
import {
  DEFAULT_MANIFEST_FILE,
  loadBuildManifest,
  resolveBuildManifestPath,
} from './build-manifest.ts';

/**
 * Describes one plugin archive selected by an app build manifest.
 *
 * Exactly one of {@link PluginSource.archive} or {@link PluginSource.file}
 * must be a non-empty string.
 */
type PluginSource = {
  /** Safe single path segment used as the plugin installation directory. */
  name: string;

  /** Expected npm package name in the extracted plugin metadata. */
  packageName?: string;

  /** HTTPS URL from which to download the plugin archive. */
  archive?: string;

  /** Plugin archive path relative to the selected manifest file. */
  file?: string;

  /** Expected hexadecimal SHA-256 digest of the selected archive. */
  sha256?: string;

  /** Whether the bundled plugin is enabled when first discovered. */
  enabledByDefault?: boolean;
};

/** Parsed subset of an app build manifest used during plugin setup. */
type BuildManifest = {
  /** Plugin archives to validate and install in declaration order. */
  plugins?: PluginSource[];
};

export type ExtractionLimits = {
  maxEntries: number;
  maxBytes: number;
};

export type DownloadLimits = {
  maxBytes: number;
  timeoutMs: number;
};

const DEFAULT_EXTRACTION_LIMITS: ExtractionLimits = {
  maxEntries: 10_000,
  maxBytes: 512 * 1024 * 1024,
};
const DEFAULT_DOWNLOAD_LIMITS: DownloadLimits = {
  maxBytes: 100 * 1024 * 1024,
  timeoutMs: 30_000,
};

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_FOLDER = path.join(scriptDirectory, '../../.plugins');
const MANIFEST_FILE = resolveBuildManifestPath();
const manifest = loadBuildManifest(MANIFEST_FILE) as BuildManifest;
// The reviewed in-repo manifest predates digest metadata; externally selected manifests are
// untrusted and must pin every plugin source.
const externalManifest = !pathsReferToSameFile(MANIFEST_FILE, DEFAULT_MANIFEST_FILE);
const VALID_PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const WINDOWS_INVALID_NAME_CHARACTERS = /[<>:"|?*\u0000-\u001f]/;

/**
 * Checks whether two paths identify the same file after filesystem canonicalization.
 *
 * @param firstPath First path to compare.
 * @param secondPath Second path to compare.
 * @returns Whether both paths resolve to the same canonical file.
 */
export function pathsReferToSameFile(firstPath: string, secondPath: string): boolean {
  const canonicalize = (filePath: string): string => {
    const resolvedPath = path.resolve(filePath);
    const canonicalPath = fs.existsSync(resolvedPath)
      ? fs.realpathSync.native(resolvedPath)
      : resolvedPath;
    return process.platform === 'win32' ? canonicalPath.toLowerCase() : canonicalPath;
  };

  return canonicalize(firstPath) === canonicalize(secondPath);
}

/**
 * Validates the syntax of a declared SHA-256 digest.
 *
 * @param digest Hexadecimal SHA-256 digest to validate.
 * @returns Nothing when the digest has the expected format.
 * @throws When the digest is not exactly 64 hexadecimal characters.
 */
function validateDigestFormat(digest: string): void {
  if (!/^[a-f0-9]{64}$/i.test(digest)) {
    throw new Error(`Invalid SHA-256 digest for plugin archive: ${digest}`);
  }
}

/**
 * Checks whether a plugin name is safe as a cross-platform directory name.
 *
 * @param name Plugin destination directory name to validate.
 * @returns Whether the name is a single portable path segment.
 */
function isSafePluginName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    name !== '' &&
    name !== '.' &&
    name !== '..' &&
    name === path.basename(name) &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !name.endsWith('.') &&
    !name.endsWith(' ') &&
    !WINDOWS_RESERVED_NAME.test(name) &&
    !WINDOWS_INVALID_NAME_CHARACTERS.test(name)
  );
}

/**
 * Ensures a plugin source satisfies the integrity policy for its manifest.
 *
 * @param plugin Plugin source declaration to validate.
 * @param isExternalManifest Whether the source comes from an external product manifest.
 * @returns Nothing when the plugin source is valid.
 * @throws When the plugin name or source is unsafe, ambiguous, or incomplete.
 * @throws When an external source lacks a required digest or package name, or declares malformed
 * integrity metadata.
 */
export function validatePluginSource(
  plugin: PluginSource,
  isExternalManifest: boolean = externalManifest
): void {
  if (!isSafePluginName(plugin.name)) {
    throw new Error(`Invalid plugin name: ${String(plugin.name)}`);
  }

  const declaredSources = [plugin.archive, plugin.file].filter(source => source !== undefined);
  if (declaredSources.length !== 1) {
    throw new Error(`Plugin ${plugin.name} must declare exactly one source: archive or file`);
  }
  if (typeof declaredSources[0] !== 'string' || declaredSources[0].trim() === '') {
    throw new Error(`Plugin ${plugin.name} source must not be empty`);
  }

  if (isExternalManifest && plugin.sha256 === undefined) {
    throw new Error(`External plugin ${plugin.name} must declare a SHA-256 digest`);
  }
  if (plugin.sha256 !== undefined) {
    validateDigestFormat(plugin.sha256);
  }
  if (
    isExternalManifest &&
    (typeof plugin.packageName !== 'string' || !VALID_PACKAGE_NAME.test(plugin.packageName))
  ) {
    throw new Error(`External plugin ${plugin.name} must declare a valid package name`);
  }
}

/**
 * Verifies that an extracted plugin matches its declared package identity.
 *
 * @param packageJsonPath Path to the extracted plugin package metadata.
 * @param expectedPackageName Package name declared by the build manifest.
 * @returns Nothing when no identity is declared or the identity matches.
 * @throws When the extracted package name differs from the declared identity.
 */
export function verifyPluginIdentity(packageJsonPath: string, expectedPackageName?: string): void {
  if (expectedPackageName === undefined) {
    return;
  }
  let packageJson: { name?: string };
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { name?: string };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Plugin identity verification failed for ${expectedPackageName}: ${reason}`, {
      cause: error,
    });
  }
  if (packageJson.name !== expectedPackageName) {
    throw new Error(
      `Plugin package name mismatch: expected ${expectedPackageName}, got ${packageJson.name}`
    );
  }
}

/**
 * Verifies a plugin archive against its declared SHA-256 digest.
 *
 * @param archivePath Path to the plugin archive.
 * @param expectedDigest Expected hexadecimal SHA-256 digest, when declared.
 * @returns Nothing when no digest is declared or the digest matches.
 * @throws When the digest is malformed or does not match the archive.
 */
export function verifyArchiveDigest(archivePath: string, expectedDigest?: string): void {
  if (expectedDigest === undefined) {
    return;
  }
  validateDigestFormat(expectedDigest);

  const hash = crypto.createHash('sha256');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  const descriptor = fs.openSync(archivePath, 'r');
  try {
    let bytesRead: number;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) {
        hash.update(buffer.subarray(0, bytesRead));
      }
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  const actualDigest = hash.digest('hex');
  if (actualDigest.toLowerCase() !== expectedDigest.toLowerCase()) {
    throw new Error(
      `Plugin archive SHA-256 mismatch: expected ${expectedDigest}, got ${actualDigest}`
    );
  }
}

/**
 * Extracts a plugin archive into Headlamp's bundled plugin directory.
 *
 * @param name Name of the plugin destination directory.
 * @param archivePath Path to the compressed plugin archive.
 * @param temporaryFolder Directory used to extract and inspect archive contents.
 * @returns A promise that resolves after the plugin files are copied.
 */
export async function extractArchive(
  name: string,
  archivePath: string,
  temporaryFolder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-plugins')),
  pluginRoot: string = PLUGIN_FOLDER,
  limits: ExtractionLimits = DEFAULT_EXTRACTION_LIMITS
): Promise<void> {
  console.log('Extracting archive', archivePath, 'to', temporaryFolder, '...');
  let entryCount = 0;
  let extractedBytes = 0;
  let extractionError: Error | undefined;
  const extractor = tar.x({
    C: temporaryFolder,
    filter: (_entryPath, entry) => {
      const entryType = 'type' in entry ? entry.type : 'File';
      if (!['File', 'OldFile', 'Directory'].includes(entryType)) {
        extractionError = new Error(
          `Plugin archive contains unsupported link or entry type: ${entryType}`
        );
        return false;
      }
      return true;
    },
    onReadEntry: entry => {
      entryCount += 1;
      // node-tar reads exactly `size` bytes per entry, so the header value bounds real output.
      extractedBytes += entry.size;
      if (entryCount > limits.maxEntries) {
        extractionError = new Error(`Plugin archive exceeds entry limit of ${limits.maxEntries}`);
      } else if (extractedBytes > limits.maxBytes) {
        extractionError = new Error(
          `Plugin archive exceeds extraction size limit of ${limits.maxBytes}`
        );
      }
      if (extractionError) {
        extractor.abort(extractionError);
      }
    },
  });
  await pipeline(fs.createReadStream(archivePath), zlib.createGunzip(), extractor);
  if (extractionError) throw extractionError;

  const pluginFolder = path.join(pluginRoot, name);
  fs.mkdirSync(pluginFolder, { recursive: true });

  const mainLocations = globSync(path.join(temporaryFolder, '*', 'main.js').replace(/\\/g, '/'));
  const mainLocation = mainLocations[0];
  if (mainLocation && fs.existsSync(mainLocation)) {
    copyExtractedRegularFile(mainLocation, path.join(pluginFolder, 'main.js'), temporaryFolder);
    copyExtractedRegularFile(
      path.join(path.dirname(mainLocation), 'package.json'),
      path.join(pluginFolder, 'package.json'),
      temporaryFolder
    );
  } else if (fs.existsSync(path.join(temporaryFolder, 'package', 'dist'))) {
    copyExtractedRegularFile(
      path.join(temporaryFolder, 'package', 'dist', 'main.js'),
      path.join(pluginFolder, 'main.js'),
      temporaryFolder
    );
    copyExtractedRegularFile(
      path.join(temporaryFolder, 'package', 'package.json'),
      path.join(pluginFolder, 'package.json'),
      temporaryFolder
    );
  } else {
    throw new Error(`Failed to find plugin content within archive: ${archivePath}`);
  }
}

function copyExtractedRegularFile(
  source: string,
  destination: string,
  extractionRoot: string
): void {
  const realRoot = fs.realpathSync.native(extractionRoot);
  const realSource = fs.realpathSync.native(source);
  const relativeSource = path.relative(realRoot, realSource);
  if (relativeSource.startsWith('..') || path.isAbsolute(relativeSource)) {
    throw new Error(`Extracted plugin file escapes extraction directory: ${source}`);
  }
  if (!fs.lstatSync(source).isFile()) {
    throw new Error(`Extracted plugin file must be a regular file: ${source}`);
  }
  fs.copyFileSync(realSource, destination);
}

/**
 * Downloads a plugin archive over HTTPS.
 *
 * @param url HTTPS URL of the plugin archive.
 * @param destinationPath Path where the downloaded archive is written.
 * @param redirectCount Number of redirects followed so far.
 * @param limits Download size and total duration limits.
 * @param initialHostname Original hostname used to constrain redirects.
 * @param deadline Absolute deadline shared by every request in the redirect chain.
 * @returns A promise that resolves when the archive is fully written.
 * @throws When the URL is invalid or insecure, redirects exceed the limit, or the request fails.
 */
export function downloadFile(
  url: string,
  destinationPath: string,
  redirectCount: number = 0,
  limits: DownloadLimits = DEFAULT_DOWNLOAD_LIMITS,
  initialHostname?: string,
  deadline: number = Date.now() + limits.timeoutMs
): Promise<void> {
  return new Promise((resolve, reject) => {
    let parsedUrl: URL;
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
    const remainingTime = deadline - Date.now();
    if (remainingTime <= 0) {
      fs.rmSync(destinationPath, { force: true });
      reject(new Error(`Plugin archive download timed out after ${limits.timeoutMs}ms`));
      return;
    }

    const sourceHostname = initialHostname ?? parsedUrl.hostname;
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (error) {
        fs.rmSync(destinationPath, { force: true });
        reject(error);
      } else {
        resolve();
      }
    };

    const request = https.get(parsedUrl, (response: import('node:http').IncomingMessage) => {
      const statusCode = response.statusCode ?? 0;
      if (statusCode >= 200 && statusCode < 300) {
        const contentLength = Number(response.headers['content-length'] ?? 0);
        if (contentLength > limits.maxBytes) {
          response.resume();
          finish(new Error(`Plugin archive exceeds download size limit of ${limits.maxBytes}`));
          return;
        }

        let downloadedBytes = 0;
        const limiter = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            downloadedBytes += chunk.length;
            if (downloadedBytes > limits.maxBytes) {
              callback(
                new Error(`Plugin archive exceeds download size limit of ${limits.maxBytes}`)
              );
              return;
            }
            callback(null, chunk);
          },
        });
        void pipeline(response, limiter, fs.createWriteStream(destinationPath))
          .then(() => finish())
          .catch(error => finish(error as Error));
      } else if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
        let redirectUrl: URL;
        try {
          redirectUrl = new URL(response.headers.location, parsedUrl);
        } catch {
          response.resume();
          finish(new Error(`Invalid plugin archive redirect URL: ${response.headers.location}`));
          return;
        }
        if (!isAllowedRedirectHost(sourceHostname, redirectUrl.hostname)) {
          response.resume();
          finish(new Error(`Plugin archive redirect host is not allowed: ${redirectUrl.hostname}`));
          return;
        }
        response.resume();
        downloadFile(
          redirectUrl.toString(),
          destinationPath,
          redirectCount + 1,
          limits,
          sourceHostname,
          deadline
        )
          .then(() => finish())
          .catch(error => finish(error as Error));
      } else {
        response.resume();
        finish(new Error(`Plugin archive download failed with status ${statusCode}: ${url}`));
      }
    });
    request.on('error', error => finish(error));
    const timeout = setTimeout(() => {
      request.destroy(new Error(`Plugin archive download timed out after ${limits.timeoutMs}ms`));
    }, remainingTime);
  });
}

function isAllowedRedirectHost(sourceHostname: string, targetHostname: string): boolean {
  if (sourceHostname === targetHostname) return true;
  const sourceIsGitHub = sourceHostname === 'github.com' || sourceHostname.endsWith('.github.com');
  return sourceIsGitHub && targetHostname.endsWith('.githubusercontent.com');
}

/**
 * Derives a local archive filename from a plugin URL pathname.
 *
 * @param url Plugin archive URL.
 * @returns The final pathname segment without query or fragment data.
 * @throws When the URL pathname does not contain a filename.
 */
export function getArchiveFileName(url: string): string {
  const archiveName = path.posix.basename(new URL(url).pathname);
  if (!archiveName) {
    throw new Error(`Plugin archive URL does not contain a file name: ${url}`);
  }
  return archiveName;
}

/**
 * Downloads, verifies, extracts, and removes a temporary plugin archive.
 *
 * @param name Name of the plugin destination directory.
 * @param url HTTPS URL of the plugin archive.
 * @param sha256 Expected SHA-256 digest, when declared.
 * @returns A promise that resolves after the plugin is installed.
 */
export async function fetchArchive(
  name: string,
  url: string,
  sha256: string | undefined,
  pluginRoot: string = PLUGIN_FOLDER
): Promise<void> {
  const archiveName = getArchiveFileName(url);
  fs.mkdirSync(pluginRoot, { recursive: true });

  const temporaryFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-plugins'));
  const archivePath = path.join(temporaryFolder, archiveName);
  try {
    await downloadFile(url, archivePath);
    verifyArchiveDigest(archivePath, sha256);
    await extractArchive(name, archivePath, temporaryFolder, pluginRoot);
  } finally {
    fs.rmSync(temporaryFolder, { recursive: true, force: true });
  }
}

export function resolveLocalPluginArchive(manifestFile: string, source: string): string {
  if (path.isAbsolute(source)) {
    throw new Error(`Plugin file source must be relative to the manifest: ${source}`);
  }
  const manifestDirectory = fs.realpathSync.native(path.dirname(manifestFile));
  const candidate = path.resolve(manifestDirectory, source);
  const lexicalRelative = path.relative(manifestDirectory, candidate);
  if (lexicalRelative.startsWith('..') || path.isAbsolute(lexicalRelative)) {
    throw new Error(`Plugin file source must stay within the manifest directory: ${source}`);
  }
  const realCandidate = fs.realpathSync.native(candidate);
  const realRelative = path.relative(manifestDirectory, realCandidate);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw new Error(`Plugin file source must stay within the manifest directory: ${source}`);
  }
  if (!fs.statSync(realCandidate).isFile()) {
    throw new Error(`Plugin file source must be a regular file: ${source}`);
  }
  return realCandidate;
}

function copyArchiveToPrivateDirectory(source: string): { archivePath: string; directory: string } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-plugin-local-'));
  const archivePath = path.join(directory, path.basename(source));
  const sourceDescriptor = fs.openSync(source, 'r');
  const destinationDescriptor = fs.openSync(archivePath, 'wx', 0o600);
  const buffer = Buffer.allocUnsafe(64 * 1024);
  try {
    let bytesRead: number;
    do {
      bytesRead = fs.readSync(sourceDescriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) fs.writeSync(destinationDescriptor, buffer, 0, bytesRead);
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(sourceDescriptor);
    fs.closeSync(destinationDescriptor);
  }
  return { archivePath, directory };
}

function replacePluginFolder(stagingFolder: string): void {
  const backupFolder = `${PLUGIN_FOLDER}.backup-${process.pid}-${Date.now()}`;
  const hadExistingFolder = fs.existsSync(PLUGIN_FOLDER);
  if (hadExistingFolder) fs.renameSync(PLUGIN_FOLDER, backupFolder);
  try {
    fs.renameSync(stagingFolder, PLUGIN_FOLDER);
    fs.rmSync(backupFolder, { recursive: true, force: true });
  } catch (error) {
    if (hadExistingFolder && !fs.existsSync(PLUGIN_FOLDER) && fs.existsSync(backupFolder)) {
      fs.renameSync(backupFolder, PLUGIN_FOLDER);
    }
    throw error;
  }
}

/**
 * Installs every plugin declared by the selected build manifest.
 *
 * @returns A promise that resolves after all declared plugins are installed.
 */
export async function main(): Promise<void> {
  const plugins = manifest.plugins ?? [];
  plugins.forEach(plugin => validatePluginSource(plugin));

  const stagingFolder = fs.mkdtempSync(path.join(path.dirname(PLUGIN_FOLDER), '.plugins-stage-'));
  try {
    for (const { name, packageName, archive, file, sha256, enabledByDefault } of plugins) {
      if (archive) {
        await fetchArchive(name, archive, sha256, stagingFolder);
      }
      if (file) {
        const sourceArchive = resolveLocalPluginArchive(MANIFEST_FILE, file);
        const privateArchive = copyArchiveToPrivateDirectory(sourceArchive);
        try {
          verifyArchiveDigest(privateArchive.archivePath, sha256);
          await extractArchive(
            name,
            privateArchive.archivePath,
            privateArchive.directory,
            stagingFolder
          );
        } finally {
          fs.rmSync(privateArchive.directory, { recursive: true, force: true });
        }
      }
      const packageJsonPath = path.join(stagingFolder, name, 'package.json');
  verifyPluginIdentity(packageJsonPath, packageName);
      if (enabledByDefault !== undefined && fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        packageJson.headlamp = packageJson.headlamp || {};
        packageJson.headlamp.enabledByDefault = enabledByDefault;
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      }
    }
    replacePluginFolder(stagingFolder);
  } finally {
    fs.rmSync(stagingFolder, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

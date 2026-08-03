import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';
import { globSync } from 'glob';
import * as tar from 'tar';
import {
  DEFAULT_MANIFEST_FILE,
  loadBuildManifest,
  resolveBuildManifestPath,
} from './build-manifest.ts';

type PluginSource = {
  name: string;
  archive?: string;
  file?: string;
  sha256?: string;
};

type BuildManifest = {
  plugins?: PluginSource[];
};

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_FOLDER = path.join(scriptDirectory, '../../.plugins');
const MANIFEST_FILE = resolveBuildManifestPath();
const manifest = loadBuildManifest(MANIFEST_FILE) as BuildManifest;
const externalManifest = !pathsReferToSameFile(MANIFEST_FILE, DEFAULT_MANIFEST_FILE);

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
 * Ensures a plugin source satisfies the integrity policy for its manifest.
 *
 * @param plugin Plugin source declaration to validate.
 * @param requireDigest Whether remote archives must declare a SHA-256 digest.
 * @returns Nothing when the plugin source is valid.
 * @throws When a remote archive requires a digest but does not declare one.
 */
export function validatePluginSource(
  plugin: PluginSource,
  requireDigest: boolean = externalManifest
): void {
  if (plugin.archive && requireDigest && plugin.sha256 === undefined) {
    throw new Error(`External plugin archive ${plugin.name} must declare a SHA-256 digest`);
  }
  if (plugin.sha256 !== undefined) {
    validateDigestFormat(plugin.sha256);
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
  temporaryFolder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-plugins'))
): Promise<void> {
  console.log('Extracting archive', archivePath, 'to', temporaryFolder, '...');
  const extraction = new Promise<void>((resolve, reject) => {
    fs.createReadStream(archivePath)
      .pipe(zlib.createGunzip())
      .pipe(tar.x({ C: temporaryFolder }))
      .on('error', (error: Error) => {
        console.error(`Error extracting archive: ${error}`);
        reject(error);
      })
      .on('end', () => {
        const pluginFolder = path.join(PLUGIN_FOLDER, name);
        fs.mkdirSync(pluginFolder, { recursive: true });

        const mainLocations = globSync(
          path.join(temporaryFolder, '*', 'main.js').replace(/\\/g, '/')
        );
        const mainLocation = mainLocations[0];
        if (mainLocation && fs.existsSync(mainLocation)) {
          fs.copyFileSync(mainLocation, path.join(pluginFolder, 'main.js'));
          fs.copyFileSync(
            path.join(path.dirname(mainLocation), 'package.json'),
            path.join(pluginFolder, 'package.json')
          );
        } else if (fs.existsSync(path.join(temporaryFolder, 'package', 'dist'))) {
          fs.copyFileSync(
            path.join(temporaryFolder, 'package', 'dist', 'main.js'),
            path.join(pluginFolder, 'main.js')
          );
          fs.copyFileSync(
            path.join(temporaryFolder, 'package', 'package.json'),
            path.join(pluginFolder, 'package.json')
          );
        } else {
          reject(new Error(`Failed to find plugin content within archive: ${archivePath}`));
          return;
        }

        resolve();
      });
  });

  await extraction;
}

/**
 * Downloads a plugin archive over HTTPS.
 *
 * @param url HTTPS URL of the plugin archive.
 * @param destinationPath Path where the downloaded archive is written.
 * @param redirectCount Number of redirects followed so far.
 * @returns A promise that resolves when the archive is fully written.
 * @throws When the URL is invalid or insecure, redirects exceed the limit, or the request fails.
 */
export function downloadFile(
  url: string,
  destinationPath: string,
  redirectCount: number = 0
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

    https
      .get(parsedUrl, (response: import('node:http').IncomingMessage) => {
        const statusCode = response.statusCode ?? 0;
        if (statusCode >= 200 && statusCode < 300) {
          const file = fs.createWriteStream(destinationPath);
          response.pipe(file);
          file.on('error', reject);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        } else if (response.headers.location) {
          const redirectUrl = new URL(response.headers.location, parsedUrl).toString();
          response.resume();
          downloadFile(redirectUrl, destinationPath, redirectCount + 1)
            .then(resolve)
            .catch(reject);
        } else {
          response.resume();
          reject(new Error(`Plugin archive download failed with status ${statusCode}: ${url}`));
        }
      })
      .on('error', reject);
  });
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
export async function fetchArchive(name: string, url: string, sha256?: string): Promise<void> {
  const archiveName = getArchiveFileName(url);
  fs.mkdirSync(PLUGIN_FOLDER, { recursive: true });

  const temporaryFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-plugins'));
  const archivePath = path.join(temporaryFolder, archiveName);
  await downloadFile(url, archivePath);
  verifyArchiveDigest(archivePath, sha256);
  await extractArchive(name, archivePath, temporaryFolder);
  fs.unlinkSync(archivePath);
}

/**
 * Installs every plugin declared by the selected build manifest.
 *
 * @returns A promise that resolves after all declared plugins are installed.
 */
export async function main(): Promise<void> {
  for (const plugin of manifest.plugins ?? []) {
    const { name, archive, file, sha256 } = plugin;
    validatePluginSource(plugin);

    if (archive) {
      await fetchArchive(name, archive, sha256);
    }
    if (file) {
      const absolutePath = path.join(path.dirname(MANIFEST_FILE), file);
      verifyArchiveDigest(absolutePath, sha256);
      await extractArchive(name, absolutePath);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

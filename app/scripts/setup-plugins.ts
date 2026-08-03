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

/**
 * Describes one plugin archive selected by an app build manifest.
 *
 * Exactly one of {@link PluginSource.archive} or {@link PluginSource.file}
 * must be a non-empty string.
 */
type PluginSource = {
  /** Safe single path segment used as the plugin installation directory. */
  name: string;

  /** HTTPS URL from which to download the plugin archive. */
  archive?: string;

  /** Plugin archive path relative to the selected manifest file. */
  file?: string;

  /** Expected hexadecimal SHA-256 digest of the selected archive. */
  sha256?: string;
};

/** Parsed subset of an app build manifest used during plugin setup. */
type BuildManifest = {
  /** Plugin archives to validate and install in declaration order. */
  plugins?: PluginSource[];
};

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_FOLDER = path.join(scriptDirectory, '../../.plugins');
const MANIFEST_FILE = resolveBuildManifestPath();
const manifest = loadBuildManifest(MANIFEST_FILE) as BuildManifest;
const externalManifest = MANIFEST_FILE !== DEFAULT_MANIFEST_FILE;

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
 * Downloads, verifies, extracts, and removes a temporary plugin archive.
 *
 * @param name Name of the plugin destination directory.
 * @param url HTTPS URL of the plugin archive.
 * @param sha256 Expected SHA-256 digest, when declared.
 * @returns A promise that resolves after the plugin is installed.
 */
export async function fetchArchive(name: string, url: string, sha256?: string): Promise<void> {
  const archiveName = url.split('/').pop();
  if (!archiveName) {
    throw new Error(`Plugin archive URL does not contain a file name: ${url}`);
  }
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

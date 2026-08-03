import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type ManifestEnvironment = {
  [key: string]: string | undefined;
  HEADLAMP_BUILD_MANIFEST?: string;
};

type BuildManifest = {
  plugins?: Array<Record<string, unknown>>;
};

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_MANIFEST_FILE = path.join(scriptDirectory, '../app-build-manifest.json');

/**
 * Resolves the product build manifest selected by the environment.
 *
 * @param env Environment variables used to select an external manifest.
 * @param cwd Directory used to resolve a relative external manifest path.
 * @returns The absolute external manifest path, or Headlamp's default manifest path.
 */
export function resolveBuildManifestPath(
  env: ManifestEnvironment = process.env,
  cwd: string = process.cwd()
): string {
  const configuredPath = env.HEADLAMP_BUILD_MANIFEST;
  return configuredPath ? path.resolve(cwd, configuredPath) : DEFAULT_MANIFEST_FILE;
}

/**
 * Reads and parses a Headlamp build manifest.
 *
 * @param manifestFile Path to the manifest JSON file to load.
 * @returns The parsed build manifest.
 */
export function loadBuildManifest(
  manifestFile: string = resolveBuildManifestPath()
): BuildManifest {
  return JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as BuildManifest;
}

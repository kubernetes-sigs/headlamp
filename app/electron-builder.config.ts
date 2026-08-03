import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MANIFEST_FILE, resolveBuildManifestPath } from './scripts/build-manifest.ts';

type ExtraResource =
  | string
  | {
      from: string;
      to?: string;
      [key: string]: unknown;
    };

type ElectronBuilderConfiguration = {
  extraResources: ExtraResource[];
  [key: string]: unknown;
};

const require = createRequire(import.meta.url);
const packageJson = require('./package.json');
const configDirectory = path.dirname(fileURLToPath(import.meta.url));
const manifestFile = resolveBuildManifestPath();
const defaultManifest = path.resolve(DEFAULT_MANIFEST_FILE);
const packageBuild = packageJson.build as ElectronBuilderConfiguration;

const config: ElectronBuilderConfiguration = {
  ...packageBuild,
  extraResources: packageBuild.extraResources.map(resource => {
    if (
      typeof resource === 'string' ||
      path.resolve(configDirectory, resource.from) !== defaultManifest
    ) {
      return resource;
    }
    return { ...resource, from: manifestFile, to: 'app-build-manifest.json' };
  }),
};

export default config;

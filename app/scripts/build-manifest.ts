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

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRunCommandGrants, type RunCommandGrant } from '../electron/runCommandPolicy.ts';

type ManifestEnvironment = {
  [key: string]: string | undefined;
  HEADLAMP_BUILD_MANIFEST?: string;
};

export type BuildManifest = {
  /** URL glob patterns the packaged backend may proxy. */
  'proxy-urls'?: string[];

  /** Reusable command grant arrays referenced by command policies. */
  commandSets?: Record<string, RunCommandGrant[]>;

  /** Plugin declarations consumed by the app packaging scripts. */
  plugins?: BuildPlugin[];

  /** Product identity fields consumed by Electron Builder. */
  product?: Record<string, unknown>;

  /** Common and per-platform resources copied into desktop packages. */
  resources?: Record<string, unknown>;

  /** Product-owned local command policy selected for the current runtime. */
  runCommands?: ProductPluginRunCommands[];

  /** Per-platform package targets consumed by Electron Builder. */
  targets?: Record<string, unknown>;

  /** Packaged files whose SHA-256 digests must match after packaging. */
  verify?: BuildVerification[];

  [key: string]: unknown;
};

/** A shipped plugin declaration owned by the product build manifest. */
export type BuildPlugin = Record<string, unknown> & {
  /** Bundle directory name used by plugin discovery. */
  name?: string;
  /** Package identity expected inside the shipped bundle. */
  packageName?: string;
};

/** A native executable intentionally supplied by selected plugin bundles. */
export interface ProductPluginExecutable {
  /** Command identifier whose grants use the plugin-owned executable. */
  tool: string;
}

/** Product command grants for one exact plugin origin and runtime environment. */
export interface ProductPluginRunCommands {
  /** Runtime in which this policy applies. */
  environment: 'development' | 'production';
  /** Inventory containing the plugin bundle. */
  pluginLocation: 'development' | 'user' | 'shipped';
  /** Exact bundle and package identities sharing these grants. */
  plugins: Array<{
    /** Bundle directory name reported by plugin discovery. */
    bundleName: string;
    /** Package identity read from the plugin bundle. */
    packageName: string;
    /** Artifact Hub repository and package names for a managed installation. */
    artifactHubPackage?: string;
    /** Optional immutable Artifact Hub package identifier expected for managed installations. */
    artifactHubPackageId?: string;
    /** Optional immutable Artifact Hub repository identifier expected for managed installations. */
    artifactHubRepositoryId?: string;
  }>;
  /** Executables intentionally supplied by the selected plugin bundles. */
  pluginExecutables?: ProductPluginExecutable[];
  /** Local command grants enforced by the Electron main process. */
  commands?: RunCommandGrant[];
  /** Named command grant sets from the product manifest, combined in order. */
  commandSets?: string[];
}

/** Validated command policy for one plugin identity and inventory. */
export interface ProductPluginCommandPolicy {
  /** Bundle directory name from the product manifest. */
  bundleName: string;
  /** Expected package name from the product manifest. */
  packageName: string;
  /** Inventory containing the authorized plugin. */
  source: 'development' | 'user' | 'shipped';
  /** App-owned installation provenance required for managed plugin inventories. */
  artifactHub?: {
    /** Artifact Hub repository name recorded by the installer. */
    repository: string;
    /** Artifact Hub package name within the repository. */
    package: string;
    /** Immutable Artifact Hub package identifier required by the product policy. */
    packageId?: string;
    /** Immutable Artifact Hub repository identifier required by the product policy. */
    repositoryId?: string;
  };
  /** Reviewed command grants for the plugin. */
  grants: RunCommandGrant[];
}

const COMMAND_POLICY_DOCS_FILE = 'docs/development/plugins/command-capabilities.md';
const COMMAND_POLICY_DOCS_URL =
  'https://headlamp.dev/docs/latest/development/plugins/command-capabilities/#product-manifest-policy';

/** An Electron Builder target with an explicit architecture selection. */
type BuildTargetDescriptor = {
  /** Electron Builder package target name. */
  target: string;

  /** Architectures to build for this package target. */
  arch: string[];
};

/** A supported package target declaration from a build manifest. */
type BuildTarget = string | BuildTargetDescriptor;

/** An Electron Builder resource declared by a product manifest. */
type BuildResource = {
  /** Glob patterns included beneath the source path. */
  filter?: string[];

  /** Source path, resolved relative to the selected manifest. */
  from: string;

  /** Optional destination beneath the packaged resources directory. */
  to?: string;
};

/** A packaged resource integrity requirement from a product manifest. */
type BuildVerification = {
  /** Relative path beneath the packaged resources directory. */
  path: string;

  /** Platforms on which the resource must be verified. */
  platforms?: Array<'linux' | 'mac' | 'win'>;

  /** Expected hexadecimal SHA-256 digest. */
  sha256: string;
};

type ProductMetadata = {
  name?: string;
  productName?: string;
  version?: string;
  appId?: string;
  artifactName?: string;
  protocols?: Record<string, unknown>;
};

/**
 * Converts Electron Builder's optional singleton-or-array resources to an array.
 *
 * @param resources Existing Electron Builder extra resources.
 * @returns An empty array for nullish input, the original array, or a wrapped singleton.
 */
function normalizeExtraResources(resources: unknown): unknown[] {
  if (resources === undefined || resources === null) {
    return [];
  }
  return Array.isArray(resources) ? resources : [resources];
}

const scriptDirectory =
  typeof __dirname === 'string' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

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
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as unknown;
  return validateBuildManifest(manifest);
}

/**
 * Reports whether a candidate path is the root or is contained beneath it.
 *
 * @param root Absolute root path.
 * @param candidate Absolute candidate path.
 * @returns Whether the candidate is contained by the root.
 */
function isPathWithinRoot(root: string, candidate: string): boolean {
  const relativePath = path.relative(root, candidate);
  return (
    relativePath === '' ||
    (relativePath !== '..' &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  );
}

/**
 * Calculates a file's SHA-256 digest with bounded memory usage.
 *
 * @param filePath Path to the file to hash.
 * @returns The lowercase hexadecimal SHA-256 digest.
 */
function calculateFileSha256(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  const descriptor = fs.openSync(filePath, 'r');
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
  return hash.digest('hex');
}

/**
 * Verifies manifest-declared files in a packaged app's resources directory.
 *
 * @param resourcesDirectory Root directory containing packaged resources.
 * @param manifest Parsed application build manifest.
 * @param platform Electron runtime platform name for the package being verified.
 * @throws When verification declarations are malformed or a resource is unsafe or mismatched.
 */
export function verifyPackagedResources(
  resourcesDirectory: string,
  manifest: unknown,
  platform: string
): void {
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    throw new Error('Build manifest must be an object');
  }

  const verification = (manifest as BuildManifest).verify;
  if (verification === undefined) {
    return;
  }
  if (!Array.isArray(verification)) {
    throw new Error('Build manifest verify must be an array');
  }

  const platformName = { darwin: 'mac', mas: 'mac', win32: 'win' }[platform] ?? platform;
  const root = path.resolve(resourcesDirectory);
  for (const [index, entry] of verification.entries()) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      Array.isArray(entry) ||
      typeof entry.path !== 'string' ||
      entry.path.trim() === '' ||
      typeof entry.sha256 !== 'string' ||
      Object.keys(entry).some(key => !['path', 'platforms', 'sha256'].includes(key)) ||
      (entry.platforms !== undefined &&
        (!Array.isArray(entry.platforms) ||
          entry.platforms.some(value => !['linux', 'mac', 'win'].includes(value))))
    ) {
      throw new Error(`Invalid build manifest verify[${index}]`);
    }
    if (entry.platforms && !entry.platforms.includes(platformName as 'linux' | 'mac' | 'win')) {
      continue;
    }
    if (!/^[a-f0-9]{64}$/i.test(entry.sha256)) {
      throw new Error(`Invalid SHA-256 for packaged resource ${entry.path}`);
    }

    const resource = path.resolve(root, entry.path);
    if (!isPathWithinRoot(root, resource)) {
      throw new Error(`Packaged resource escapes the resources directory: ${entry.path}`);
    }

    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(resource);
    } catch {
      throw new Error(`Packaged resource is not a regular file: ${entry.path}`);
    }
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Packaged resource is not a regular file: ${entry.path}`);
    }

    const canonicalRoot = fs.realpathSync(root);
    const canonicalResource = fs.realpathSync(resource);
    if (!isPathWithinRoot(canonicalRoot, canonicalResource)) {
      throw new Error(`Packaged resource escapes the resources directory: ${entry.path}`);
    }

    const actualDigest = calculateFileSha256(resource);
    if (actualDigest.toLowerCase() !== entry.sha256.toLowerCase()) {
      throw new Error(`SHA-256 mismatch for packaged resource ${entry.path}`);
    }
  }
}

/**
 * Validates fields that are consumed outside plugin installation.
 *
 * Proxy URL values become a comma-separated backend command argument, so each
 * entry must be a single HTTP(S) URL glob with a literal hostname. Only `*`
 * wildcards are supported; other backend glob metacharacters are rejected.
 *
 * @param value Parsed manifest JSON.
 * @returns The validated build manifest.
 * @throws When the manifest shape or a proxy URL pattern is unsafe.
 */
export function validateBuildManifest(value: unknown): BuildManifest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Build manifest must be a JSON object');
  }

  const manifest = value as BuildManifest;
  const proxyUrls = manifest['proxy-urls'];
  if (proxyUrls !== undefined) {
    if (!Array.isArray(proxyUrls) || proxyUrls.some(pattern => typeof pattern !== 'string')) {
      throw new Error('Build manifest proxy-urls must be an array of strings');
    }
    for (const pattern of proxyUrls) {
      if (pattern.trim() === '' || /[\r\n,?\[\]{}\\]/.test(pattern)) {
        throw new Error(`Invalid build manifest proxy-urls pattern: ${pattern}`);
      }
      let parsedPattern: URL;
      try {
        parsedPattern = new URL(pattern.replaceAll('*', 'wildcard'));
      } catch {
        throw new Error(`Invalid build manifest proxy-urls pattern: ${pattern}`);
      }
      const authority = pattern.match(/^https?:\/\/([^/]+)/i)?.[1] ?? '';
      if (
        !['http:', 'https:'].includes(parsedPattern.protocol) ||
        parsedPattern.hostname === '' ||
        authority.includes('*')
      ) {
        throw new Error(`Invalid build manifest proxy-urls pattern: ${pattern}`);
      }
    }
  }

  if (manifest.plugins !== undefined) {
    if (!Array.isArray(manifest.plugins)) {
      throw new Error('Build manifest plugins must be an array');
    }
  }
  productPluginCommandPolicies(manifest, 'development');
  productPluginCommandPolicies(manifest, 'production');
  warnAboutArtifactHubUuidPins(manifest);
  return manifest;
}

function warnAboutArtifactHubUuidPins(manifest: BuildManifest): void {
  for (const [policyIndex, policy] of (manifest.runCommands ?? []).entries()) {
    const recommendsUuidPins =
      policy.environment === 'production' && policy.pluginLocation === 'user';

    for (const [pluginIndex, plugin] of policy.plugins.entries()) {
      const location = `runCommands[${policyIndex}].plugins[${pluginIndex}]`;
      const hasUuidPins = plugin.artifactHubPackageId !== undefined;

      if (recommendsUuidPins && !hasUuidPins) {
        console.warn(
          `Build manifest warning: ${location} should pin artifactHubPackageId and ` +
            `artifactHubRepositoryId. Request ` +
            `https://artifacthub.io/api/v1/packages/headlamp/${plugin.artifactHubPackage}, ` +
            `then copy package_id to artifactHubPackageId and repository.repository_id to ` +
            `artifactHubRepositoryId. See ${COMMAND_POLICY_DOCS_FILE} or ${COMMAND_POLICY_DOCS_URL}`
        );
      } else if (!recommendsUuidPins && hasUuidPins) {
        console.warn(
          `Build manifest warning: ${location} should omit artifactHubPackageId and ` +
            `artifactHubRepositoryId because UUID pins apply only to production policies for ` +
            `plugin-manager-installed user plugins. See ${COMMAND_POLICY_DOCS_FILE} or ` +
            `${COMMAND_POLICY_DOCS_URL}`
        );
      }
    }
  }
}

/**
 * Reads validated, product-owned command policy for plugins.
 *
 * @param manifest - Parsed application build manifest.
 * @param environment - Runtime environment whose policies should be returned.
 * @returns Validated command policies for the selected environment.
 * @throws When a policy or plugin identity is malformed or ambiguous.
 */
export function productPluginCommandPolicies(
  manifest: BuildManifest,
  environment: 'development' | 'production'
): ProductPluginCommandPolicy[] {
  const policies: ProductPluginCommandPolicy[] = [];
  const identities = new Set<string>();
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  const commandSets = manifest.commandSets;

  if (
    commandSets !== undefined &&
    (typeof commandSets !== 'object' || commandSets === null || Array.isArray(commandSets))
  ) {
    throw new Error('Build manifest commandSets must be an object');
  }
  if (commandSets && Object.keys(commandSets).length > 64) {
    throw new Error('Build manifest commandSets exceeds 64 entries');
  }
  for (const [name, commands] of Object.entries(commandSets ?? {})) {
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) ||
      !Array.isArray(commands) ||
      commands.some(
        command =>
          typeof command !== 'object' ||
          command === null ||
          Array.isArray(command) ||
          Object.keys(command).some(key => !['tool', 'args', 'allowTrailingArgs'].includes(key))
      )
    ) {
      throw new Error(`Invalid build manifest commandSets.${name}`);
    }
    parseRunCommandGrants(commands);
  }

  if (manifest.runCommands === undefined) {
    return policies;
  }
  if (!Array.isArray(manifest.runCommands)) {
    throw new Error('Build manifest runCommands must be an array');
  }
  for (const [index, policy] of manifest.runCommands.entries()) {
    if (
      typeof policy !== 'object' ||
      policy === null ||
      Array.isArray(policy) ||
      Object.keys(policy).some(
        key =>
          ![
            'environment',
            'pluginLocation',
            'plugins',
            'pluginExecutables',
            'commands',
            'commandSets',
          ].includes(key)
      )
    ) {
      throw new Error(`Invalid build manifest runCommands[${index}]`);
    }
    if (!['development', 'production'].includes(policy.environment)) {
      throw new Error(`Invalid build manifest runCommands[${index}].environment`);
    }
    if (!['development', 'user', 'shipped'].includes(policy.pluginLocation)) {
      throw new Error(`Invalid build manifest runCommands[${index}].pluginLocation`);
    }
    if (
      !Array.isArray(policy.plugins) ||
      policy.plugins.length === 0 ||
      policy.plugins.length > 64
    ) {
      throw new Error(`Invalid build manifest runCommands[${index}].plugins`);
    }

    const pluginExecutables = new Set<string>();
    if (policy.pluginExecutables !== undefined) {
      if (!Array.isArray(policy.pluginExecutables) || policy.pluginExecutables.length > 64) {
        throw new Error(`Invalid build manifest runCommands[${index}].pluginExecutables`);
      }
      for (const [executableIndex, executable] of policy.pluginExecutables.entries()) {
        if (
          typeof executable !== 'object' ||
          executable === null ||
          Array.isArray(executable) ||
          Object.keys(executable).some(key => key !== 'tool') ||
          typeof executable.tool !== 'string' ||
          executable.tool === 'scriptjs' ||
          pluginExecutables.has(executable.tool)
        ) {
          throw new Error(
            `Invalid build manifest runCommands[${index}].pluginExecutables[${executableIndex}]`
          );
        }
        pluginExecutables.add(executable.tool);
      }
    }

    const hasInlineCommands = policy.commands !== undefined;
    const hasCommandSets = policy.commandSets !== undefined;
    if (hasInlineCommands === hasCommandSets) {
      throw new Error(
        `Build manifest runCommands[${index}] must define exactly one of commands or commandSets`
      );
    }
    if (
      hasCommandSets &&
      (!Array.isArray(policy.commandSets) ||
        policy.commandSets.length === 0 ||
        policy.commandSets.length > 64 ||
        new Set(policy.commandSets).size !== policy.commandSets.length ||
        policy.commandSets.some(
          name =>
            typeof name !== 'string' ||
            !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) ||
            commandSets?.[name] === undefined
        ))
    ) {
      throw new Error(`Invalid build manifest runCommands[${index}].commandSets`);
    }
    const commands = hasCommandSets
      ? policy.commandSets?.flatMap(name => commandSets?.[name] ?? [])
      : policy.commands;
    if (
      !Array.isArray(commands) ||
      commands.length > 64 ||
      commands.some(
        command =>
          typeof command !== 'object' ||
          command === null ||
          Array.isArray(command) ||
          Object.keys(command).some(key => !['tool', 'args', 'allowTrailingArgs'].includes(key))
      )
    ) {
      throw new Error(`Invalid build manifest runCommands[${index}].commands`);
    }
    const parsedGrants = parseRunCommandGrants(commands);
    for (const tool of pluginExecutables) {
      if (!parsedGrants.some(grant => grant.tool === tool)) {
        throw new Error(`Unused build manifest runCommands[${index}] plugin executable ${tool}`);
      }
    }
    const grants = parsedGrants.map(grant => {
      return pluginExecutables.has(grant.tool)
        ? {
            ...grant,
            executable: { source: 'plugin' as const, path: `bin/${grant.tool}` },
          }
        : grant;
    });
    for (const [pluginIndex, plugin] of policy.plugins.entries()) {
      if (
        typeof plugin !== 'object' ||
        plugin === null ||
        Array.isArray(plugin) ||
        Object.keys(plugin).some(
          key =>
            ![
              'bundleName',
              'packageName',
              'artifactHubPackage',
              'artifactHubPackageId',
              'artifactHubRepositoryId',
            ].includes(key)
        ) ||
        typeof plugin.bundleName !== 'string' ||
        plugin.bundleName === '' ||
        plugin.bundleName.trim() !== plugin.bundleName ||
        plugin.bundleName.includes('\0') ||
        plugin.bundleName.includes('/') ||
        plugin.bundleName.includes('\\') ||
        typeof plugin.packageName !== 'string' ||
        plugin.packageName === '' ||
        plugin.packageName.trim() !== plugin.packageName ||
        plugin.packageName.includes('\0')
      ) {
        throw new Error(`Invalid build manifest runCommands[${index}].plugins[${pluginIndex}]`);
      }
      const hasArtifactHubPackageId = plugin.artifactHubPackageId !== undefined;
      const hasArtifactHubRepositoryId = plugin.artifactHubRepositoryId !== undefined;
      const artifactHubPackage =
        typeof plugin.artifactHubPackage === 'string' && plugin.artifactHubPackage.length <= 257
          ? plugin.artifactHubPackage.match(
              /^([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*)$/
            )
          : undefined;
      if (
        (plugin.artifactHubPackage !== undefined && !artifactHubPackage) ||
        ((hasArtifactHubPackageId || hasArtifactHubRepositoryId) && !artifactHubPackage) ||
        hasArtifactHubPackageId !== hasArtifactHubRepositoryId ||
        (hasArtifactHubPackageId &&
          (!uuid.test(plugin.artifactHubPackageId ?? '') ||
            !uuid.test(plugin.artifactHubRepositoryId ?? '')))
      ) {
        throw new Error(
          `Invalid Artifact Hub identity in build manifest runCommands[${index}].plugins[${pluginIndex}]`
        );
      }
      /** @see ../../docs/development/plugins/command-capabilities.md#product-manifest-policy */
      const requiresArtifactHubIdentity =
        policy.environment === 'production' && policy.pluginLocation === 'user';
      if (requiresArtifactHubIdentity && !artifactHubPackage) {
        throw new Error(
          `Missing Artifact Hub identity in build manifest runCommands[${index}].plugins[${pluginIndex}]`
        );
      }
      const identity = `${policy.environment}\0${policy.pluginLocation}\0${plugin.bundleName}\0${plugin.packageName}`;
      if (identities.has(identity)) {
        throw new Error(
          `Duplicate command policy identity in build manifest runCommands[${index}]`
        );
      }
      identities.add(identity);
      if (policy.environment === environment) {
        policies.push({
          bundleName: plugin.bundleName,
          packageName: plugin.packageName,
          source: policy.pluginLocation,
          ...(artifactHubPackage && {
            artifactHub: {
              repository: artifactHubPackage[1],
              package: artifactHubPackage[2],
              ...(hasArtifactHubPackageId && {
                packageId: plugin.artifactHubPackageId,
                repositoryId: plugin.artifactHubRepositoryId,
              }),
            },
          }),
          grants,
        });
      }
    }
  }
  return policies;
}

/**
 * Applies supported product metadata from a build manifest.
 *
 * @param config Electron Builder configuration to extend.
 * @param manifest Parsed build manifest.
 * @returns The original configuration when metadata is absent, or a copy with overrides applied.
 * @throws When the manifest or product metadata is malformed.
 */
export function applyProductMetadata<T extends object>(config: T, manifest: unknown): T {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Build manifest must be an object');
  }

  const product = (manifest as BuildManifest).product;
  if (product === undefined) {
    return config;
  }
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    throw new Error('Build manifest product must be an object');
  }

  const scalarFields = ['name', 'productName', 'version', 'appId', 'artifactName'] as const;
  for (const field of scalarFields) {
    if (product[field] !== undefined && typeof product[field] !== 'string') {
      throw new Error(`Build manifest product.${field} must be a string`);
    }
  }
  if (
    product.protocols !== undefined &&
    (!product.protocols ||
      typeof product.protocols !== 'object' ||
      Array.isArray(product.protocols))
  ) {
    throw new Error('Build manifest product.protocols must be an object');
  }
  if (product.protocols !== undefined) {
    // The app reads this same field at runtime to decide which deep links to
    // accept, so an unusable value would silently fall back to the Headlamp
    // scheme while the installer registers something else.
    const schemes = (product.protocols as Record<string, unknown>).schemes;
    if (
      !Array.isArray(schemes) ||
      schemes.length === 0 ||
      schemes.some(scheme => typeof scheme !== 'string' || scheme === '')
    ) {
      throw new Error(
        'Build manifest product.protocols.schemes must be a non-empty array of strings'
      );
    }
  }

  const metadata = product as ProductMetadata;
  const configRecord = config as Record<string, unknown>;

  const currentExtraMetadata =
    configRecord.extraMetadata &&
    typeof configRecord.extraMetadata === 'object' &&
    !Array.isArray(configRecord.extraMetadata)
      ? configRecord.extraMetadata
      : {};

  return {
    ...config,
    ...(metadata.productName && { productName: metadata.productName }),
    ...(metadata.appId && { appId: metadata.appId }),
    ...(metadata.artifactName && { artifactName: metadata.artifactName }),
    ...(metadata.protocols && { protocols: metadata.protocols }),
    ...(metadata.version && { buildVersion: metadata.version }),
    extraMetadata: {
      ...currentExtraMetadata,
      ...(metadata.name && { name: metadata.name }),
      ...(metadata.productName && { productName: metadata.productName }),
      ...(metadata.version && { version: metadata.version }),
    },
  } as T;
}

/**
 * Appends manifest-declared resources to Electron Builder configuration.
 *
 * @param config Electron Builder configuration to extend.
 * @param manifest Parsed application build manifest.
 * @param manifestFile Path used to resolve resource source paths.
 * @returns The original configuration when resources are absent, or a copy with resources applied.
 * @throws When resource groups or entries are malformed.
 */
export function applyBuildResources<T extends object>(
  config: T,
  manifest: unknown,
  manifestFile: string = resolveBuildManifestPath()
): T {
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    throw new Error('Build manifest must be an object');
  }

  const resources = (manifest as BuildManifest).resources;
  if (resources === undefined) {
    return config;
  }
  if (typeof resources !== 'object' || resources === null || Array.isArray(resources)) {
    throw new Error('Build manifest resources must be an object');
  }

  const supportedGroups = new Set(['common', 'linux', 'mac', 'win']);
  for (const group of Object.keys(resources)) {
    if (!supportedGroups.has(group)) {
      throw new Error(`Unsupported build manifest resource group: ${group}`);
    }
  }

  const resolveResources = (entries: unknown, group: string): BuildResource[] => {
    if (!Array.isArray(entries)) {
      throw new Error(`Build manifest resources.${group} must be an array`);
    }
    return entries.map((entry, index) => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        throw new Error(`Invalid build manifest resources.${group}[${index}]`);
      }
      const resource = entry as Record<string, unknown>;
      if (
        typeof resource.from !== 'string' ||
        Object.keys(resource).some(key => !['filter', 'from', 'to'].includes(key)) ||
        (resource.to !== undefined && typeof resource.to !== 'string') ||
        (resource.filter !== undefined &&
          (!Array.isArray(resource.filter) ||
            resource.filter.some(value => typeof value !== 'string')))
      ) {
        throw new Error(`Invalid build manifest resources.${group}[${index}]`);
      }
      return {
        ...(resource as BuildResource),
        from: path.resolve(path.dirname(manifestFile), resource.from),
      };
    });
  };

  const configRecord = config as Record<string, unknown>;
  const result: Record<string, unknown> = { ...configRecord };
  if (resources.common !== undefined) {
    const extraResources = normalizeExtraResources(configRecord.extraResources);
    result.extraResources = [...extraResources, ...resolveResources(resources.common, 'common')];
  }
  for (const platform of ['linux', 'mac', 'win']) {
    if (resources[platform] === undefined) {
      continue;
    }
    const defaults = configRecord[platform];
    const platformDefaults =
      typeof defaults === 'object' && defaults !== null
        ? (defaults as Record<string, unknown>)
        : {};
    const extraResources = normalizeExtraResources(platformDefaults.extraResources);
    result[platform] = {
      ...platformDefaults,
      extraResources: [...extraResources, ...resolveResources(resources[platform], platform)],
    };
  }
  return result as T;
}

/**
 * Applies manifest-declared package targets to supported Electron Builder platforms.
 *
 * @param config Electron Builder configuration to extend.
 * @param manifest Parsed application build manifest.
 * @returns The original configuration when targets are absent, or a copy with targets applied.
 * @throws When target declarations or architecture names are malformed.
 */
export function applyBuildTargets<T extends object>(config: T, manifest: unknown): T {
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    throw new Error('Build manifest must be an object');
  }

  const targets = (manifest as BuildManifest).targets;
  if (targets === undefined) {
    return config;
  }
  if (typeof targets !== 'object' || targets === null || Array.isArray(targets)) {
    throw new Error('Build manifest targets must be an object');
  }

  const architecturesByPlatform: Record<string, ReadonlySet<string>> = {
    linux: new Set(['arm64', 'armv7l', 'x64']),
    mac: new Set(['arm64', 'universal', 'x64']),
    win: new Set(['arm64', 'ia32', 'x64']),
  };
  const supportedPlatforms = new Set(Object.keys(architecturesByPlatform));
  for (const platform of Object.keys(targets)) {
    if (!supportedPlatforms.has(platform)) {
      throw new Error(`Unsupported build manifest target platform: ${platform}`);
    }
  }

  const configRecord = config as Record<string, unknown>;
  const result: Record<string, unknown> = { ...configRecord };
  for (const platform of supportedPlatforms) {
    const platformTargets = targets[platform];
    if (platformTargets === undefined) {
      continue;
    }
    if (!Array.isArray(platformTargets) || platformTargets.length === 0) {
      throw new Error(`Build manifest targets.${platform} must be a non-empty array`);
    }
    for (const target of platformTargets) {
      if (typeof target === 'string') {
        if (target.trim() === '') {
          throw new Error(`Invalid build manifest target for ${platform}`);
        }
        continue;
      }
      if (
        typeof target !== 'object' ||
        target === null ||
        typeof (target as Record<string, unknown>).target !== 'string' ||
        ((target as Record<string, unknown>).target as string).trim() === '' ||
        !Array.isArray((target as Record<string, unknown>).arch)
      ) {
        throw new Error(`Invalid build manifest target for ${platform}`);
      }
      const targetDescriptor = target as BuildTargetDescriptor;
      if (
        targetDescriptor.arch.length === 0 ||
        targetDescriptor.arch.some(arch => !architecturesByPlatform[platform].has(arch))
      ) {
        throw new Error(`Invalid build manifest architecture for ${platform}`);
      }
    }
    const defaults = configRecord[platform];
    const platformDefaults =
      typeof defaults === 'object' && defaults !== null
        ? (defaults as Record<string, unknown>)
        : {};
    result[platform] = {
      ...platformDefaults,
      target: platformTargets as BuildTarget[],
    };
  }
  return result as T;
}

/**
 * Applies manifest-declared metadata to supported Electron Builder platforms.
 *
 * @param config Electron Builder configuration to extend.
 * @param manifest Parsed application build manifest.
 * @returns The original configuration when no platform metadata is declared,
 * or a copy containing the validated platform overrides.
 * @throws When the manifest or platform metadata has an unsupported shape or field.
 */
export function applyPlatformMetadata<T extends object>(config: T, manifest: unknown): T {
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    throw new Error('Build manifest must be an object');
  }

  const platforms = (manifest as { platforms?: unknown }).platforms;
  if (platforms === undefined) {
    return config;
  }
  if (typeof platforms !== 'object' || platforms === null || Array.isArray(platforms)) {
    throw new Error('Build manifest platforms must be an object');
  }

  const allowedFields = new Set([
    'appId',
    'bundleShortVersion',
    'bundleVersion',
    'executableName',
    'icon',
    'artifactName',
  ]);
  const configRecord = config as Record<string, unknown>;
  const result: Record<string, unknown> = { ...configRecord };
  for (const platform of ['linux', 'mac', 'win']) {
    const metadata = (platforms as Record<string, unknown>)[platform];
    if (metadata === undefined) {
      continue;
    }
    if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
      throw new Error(`Build manifest platforms.${platform} must be an object`);
    }
    for (const [field, fieldValue] of Object.entries(metadata)) {
      if (!allowedFields.has(field)) {
        throw new Error(`Unsupported build manifest platforms.${platform}.${field}`);
      }
      if (typeof fieldValue !== 'string') {
        throw new Error(`Build manifest platforms.${platform}.${field} must be a string`);
      }
    }
    const defaults = configRecord[platform];
    const platformDefaults =
      typeof defaults === 'object' && defaults !== null
        ? (defaults as Record<string, unknown>)
        : {};
    result[platform] = { ...platformDefaults, ...metadata };
  }
  return result as T;
}

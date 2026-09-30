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

// Portions (c) Microsoft Corp.

import { execFileSync } from 'child_process';
import spawn from 'cross-spawn';
import type { BrowserWindow } from 'electron';
import fs from 'fs';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import os from 'os';
import path from 'path';
import yaml from 'yaml';
import type { BuildManifest, ProductClusterRegistrationProvider } from '../scripts/build-manifest';
import { isTrustedDocumentUrl } from './secureStorage';

/** Executes one local utility and returns its UTF-8 standard output. */
type RunLocalUtility = (command: string, args: readonly string[]) => string;

/** Protects a temporary directory before a provider writes credentials. */
type HardenCredentialDirectory = (directoryPath: string) => void;

/** Removes a provider's temporary credential directory. */
type CleanupCredentialDirectory = (directoryPath: string) => void;

/** Protects an empty credential file before secret bytes are written. */
type HardenCredentialFile = (filePath: string) => void;

/** Atomically replaces a credential destination with a completed sibling file. */
type ReplaceCredentialFile = (sourcePath: string, destinationPath: string) => void;

/** Default shell-free local utility runner. */
const runLocalUtility: RunLocalUtility = (command, args) =>
  execFileSync(command, [...args], { encoding: 'utf8', windowsHide: true });

/** Calculates a lowercase SHA-256 digest while bounding memory usage. */
function calculateFileSha256(filePath: string): string {
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  const descriptor = fs.openSync(filePath, 'r');
  try {
    let bytesRead: number;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest('hex');
}

/** Result returned to a plugin after a native registration attempt. */
export interface ClusterRegistrationResult {
  /** Whether the provider updated the destination kubeconfig. */
  success: boolean;
  /** User-facing success or failure detail. */
  message: string;
}

interface NamedKubeConfigEntry {
  name: string;
  [key: string]: unknown;
}

interface KubeCluster extends NamedKubeConfigEntry {
  cluster?: { server?: string; [key: string]: unknown };
}

interface KubeContext extends NamedKubeConfigEntry {
  context?: { cluster?: string; [key: string]: unknown };
}

interface KubeUser extends NamedKubeConfigEntry {
  user?: Record<string, unknown>;
}

interface KubeConfig {
  clusters?: KubeCluster[];
  contexts?: KubeContext[];
  users?: KubeUser[];
  'current-context'?: string;
  [key: string]: unknown;
}

/** Provider-neutral IPC request accepted by the registration dispatcher. */
export interface ClusterRegistrationRequest {
  /** Stable provider ID selecting a native registration implementation. */
  provider: string;
  /** Provider-defined options validated by the selected implementation. */
  options: unknown;
  /** Opaque capability injected only into an attested plugin. */
  capabilitySecret: string;
}

/** Azure provider options for AKS and Arc-connected clusters. */
export interface AzureClusterRegistrationOptions {
  /** Azure subscription containing the cluster. */
  subscriptionId: string;
  /** Azure resource group containing the cluster. */
  resourceGroup: string;
  /** AKS or Arc-connected cluster name. */
  clusterName: string;
  /** Whether credentials require Azure RBAC kubelogin conversion. */
  isAzureRBACEnabled: boolean;
  /** Optional managed namespace whose scoped credentials should be retrieved. */
  managedNamespace?: string;
  /** Azure CLI resource type used to retrieve credentials. */
  clusterType?: 'aks' | 'aksarc';
}

/** Native implementation for one cluster registration provider. */
export interface ClusterRegistrationProvider<TOptions = unknown> {
  /** Stable provider ID supplied in plugin requests. */
  id: string;
  /** Validates untrusted options before provider code receives them. */
  validateOptions(options: unknown): options is TOptions;
  /** Retrieves and persists credentials using validated options. */
  register(
    options: TOptions,
    runtime: ClusterRegistrationRuntime
  ): Promise<ClusterRegistrationResult>;
}

/** Product-resolved runtime available to one provider invocation. */
export interface ClusterRegistrationRuntime {
  /** Root of the packaged application resources. */
  resourcesPath: string;
  /** Absolute paths keyed by provider-defined tool role. */
  tools: Record<string, string>;
}

/** Authorizes a provider for the exact renderer and plugin capability. */
export type AuthorizeClusterRegistration = (
  event: Electron.IpcMainInvokeEvent,
  providerId: string,
  capability: string
) => ProductClusterRegistrationProvider | undefined;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Returns whether an identifier is nonempty, trimmed, and free of control characters. */
function isCanonicalIdentifier(value: unknown): value is string {
  return isNonEmptyString(value) && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
}

/**
 * Validates a provider-neutral registration IPC request.
 *
 * @param data - Untrusted renderer payload.
 * @returns Whether the provider, options, and capability fields are structurally valid.
 */
export function isClusterRegistrationRequest(data: unknown): data is ClusterRegistrationRequest {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return false;
  }
  const request = data as Record<string, unknown>;
  return (
    typeof request.provider === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(request.provider) &&
    request.options !== undefined &&
    typeof request.capabilitySecret === 'string' &&
    /^[0-9a-f]{64}$/.test(request.capabilitySecret)
  );
}

/**
 * Validates options accepted by the built-in Azure provider.
 *
 * @param options - Untrusted provider options.
 * @returns Whether the options identify a valid AKS or Arc registration request.
 */
export function isAzureClusterRegistrationOptions(
  options: unknown
): options is AzureClusterRegistrationOptions {
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    return false;
  }
  const request = options as Record<string, unknown>;
  return (
    Object.keys(request).every(key =>
      [
        'subscriptionId',
        'resourceGroup',
        'clusterName',
        'isAzureRBACEnabled',
        'managedNamespace',
        'clusterType',
      ].includes(key)
    ) &&
    isCanonicalIdentifier(request.subscriptionId) &&
    isCanonicalIdentifier(request.resourceGroup) &&
    isCanonicalIdentifier(request.clusterName) &&
    typeof request.isAzureRBACEnabled === 'boolean' &&
    (request.managedNamespace === undefined || isCanonicalIdentifier(request.managedNamespace)) &&
    (request.clusterType === undefined ||
      request.clusterType === 'aks' ||
      request.clusterType === 'aksarc') &&
    !(request.clusterType === 'aksarc' && request.managedNamespace !== undefined)
  );
}

async function executeCommandWithShellEnvironment(
  command: string,
  args: string[]
): Promise<{ code: number | null }> {
  const { getShellEnvironment } = await import('./main');
  const environment = await getShellEnvironment();

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: environment,
      shell: false,
    });
    child.stdout?.on('data', () => {});
    child.stderr?.on('data', () => {});
    child.once('error', reject);
    child.once('close', code => resolve({ code }));
  });
}

/**
 * Get paths for Python and az-kubelogin script based on the current platform.
 */
export function getExecutablePaths(runtime: ClusterRegistrationRuntime): {
  pythonCmd: string;
  azKubeloginPath: string;
  azCliBinPath: string;
  azCliCmd: string;
} {
  const { cli: azCliCmd, python: pythonCmd, kubelogin: azKubeloginPath } = runtime.tools;
  if (![azCliCmd, pythonCmd, azKubeloginPath].every(isNonEmptyString)) {
    throw new Error('Azure cluster registration tools are not configured');
  }
  return {
    pythonCmd,
    azKubeloginPath,
    azCliBinPath: path.dirname(azCliCmd),
    azCliCmd,
  };
}

/**
 * Resolves product-declared provider tools through verified external-tool records.
 *
 * @param manifest - Runtime product manifest generated by the consumer build.
 * @param provider - Provider configuration granted to the invoking plugin.
 * @param resourcesPath - Root of packaged application resources.
 * @param platform - Runtime platform key, overridable for tests.
 * @returns Provider runtime containing confined absolute tool paths.
 */
export function resolveClusterRegistrationRuntime(
  manifest: BuildManifest,
  provider: ProductClusterRegistrationProvider,
  resourcesPath: string,
  platform: NodeJS.Platform = process.platform
): ClusterRegistrationRuntime {
  const targetPath = platform === 'win32' ? path.win32 : path.posix;
  const root = targetPath.resolve(resourcesPath);
  const toolEntries = Object.entries(provider.tools);
  if (toolEntries.length === 0) {
    return { resourcesPath: root, tools: {} };
  }
  const records = manifest['external-tools'];
  if (!Array.isArray(records)) {
    throw new Error('Product manifest has no external tools');
  }
  const canonicalRoot = fs.realpathSync(root);
  const tools = Object.fromEntries(
    toolEntries.map(([role, toolId]) => {
      const matches = records.filter(record => record.id === toolId);
      if (matches.length !== 1) {
        throw new Error(`External tool '${toolId}' is not uniquely configured`);
      }
      const platformRecord = matches[0].platforms[platform as 'linux' | 'darwin' | 'win32'];
      const configuredPath = platformRecord?.path;
      const configuredDigest = platformRecord?.sha256;
      if (
        !isNonEmptyString(configuredPath) ||
        targetPath.isAbsolute(configuredPath) ||
        typeof configuredDigest !== 'string' ||
        !/^[a-f0-9]{64}$/.test(configuredDigest)
      ) {
        throw new Error(`External tool '${toolId}' has no valid ${platform} path`);
      }
      const resolved = targetPath.resolve(root, configuredPath);
      const relative = targetPath.relative(root, resolved);
      if (
        relative === '..' ||
        relative.startsWith(`..${targetPath.sep}`) ||
        targetPath.isAbsolute(relative)
      ) {
        throw new Error(`External tool '${toolId}' escapes packaged resources`);
      }
      const canonical = fs.realpathSync(resolved);
      const canonicalRelative = path.relative(canonicalRoot, canonical);
      if (
        canonicalRelative === '..' ||
        canonicalRelative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(canonicalRelative) ||
        !fs.statSync(canonical).isFile()
      ) {
        throw new Error(`External tool '${toolId}' escapes packaged resources`);
      }
      const actualDigest = calculateFileSha256(canonical);
      if (actualDigest !== configuredDigest) {
        throw new Error(`External tool '${toolId}' failed integrity verification`);
      }
      return [role, canonical];
    })
  );
  return { resourcesPath: root, tools };
}

/**
 * Add az-kubelogin.py exec configuration to kubeconfig.
 */
function addAzKubeloginToKubeconfig(
  kubeconfigYaml: string,
  runtime: ClusterRegistrationRuntime
): string {
  const kubeconfig = parseKubeconfig(kubeconfigYaml, 'generated');
  if (!kubeconfig.users) {
    return kubeconfigYaml;
  }

  const users = getNamedEntries<KubeUser>(kubeconfig, 'users');
  const { pythonCmd, azKubeloginPath, azCliBinPath, azCliCmd } = getExecutablePaths(runtime);
  const serverId = '6dae42f8-4368-4678-94ff-3960e28e3630'; // Azure Kubernetes Service AAD Server

  // Add exec configuration to each user
  for (const user of users) {
    if (user.user) {
      console.log('[AKS] Configuring authentication for user:', user.name);

      // IMPORTANT: Remove ALL old Azure authentication methods
      // These conflict with our exec configuration
      if (user.user['auth-provider']) {
        console.log('[AKS] Removing old auth-provider configuration');
        delete user.user['auth-provider'];
      }

      // Remove any other auth fields that might conflict
      delete user.user.token;
      delete user.user['client-certificate'];
      delete user.user['client-certificate-data'];
      delete user.user['client-key'];
      delete user.user['client-key-data'];

      // Set up exec authentication with our bundled Python script
      // Include PATH and AZ_CLI_PATH in env
      const pathSeparator = process.platform === 'win32' ? ';' : ':';
      const currentPath = process.env.PATH || '';
      const newPath = `${azCliBinPath}${pathSeparator}${currentPath}`;

      user.user.exec = {
        apiVersion: 'client.authentication.k8s.io/v1beta1',
        command: pythonCmd,
        args: [azKubeloginPath, '--server-id', serverId],
        env: [
          {
            name: 'PATH',
            value: newPath,
          },
          {
            name: 'AZ_CLI_PATH',
            value: azCliCmd,
          },
        ],
        provideClusterInfo: false,
      };

      console.log('[AKS] Added exec configuration using Python script:', azKubeloginPath);
      console.log('[AKS] Azure CLI path set to:', azCliCmd);
    }
  }

  // Use yaml.stringify with options to preserve strings and prevent line wrapping
  // This ensures paths with spaces are properly quoted and not split across lines
  return yaml.stringify(kubeconfig, {
    lineWidth: 0, // Disable line wrapping
    defaultStringType: 'QUOTE_DOUBLE', // Quote strings to handle spaces properly
  });
}

/**
 * Detects whether generated credentials invoke the external kubelogin executable.
 *
 * @param kubeconfigYaml - Generated kubeconfig YAML to inspect.
 * @returns Whether any user exec configuration launches kubelogin.
 * @throws When the generated kubeconfig or user collection is malformed.
 */
export function kubeconfigUsesKubelogin(kubeconfigYaml: string): boolean {
  const kubeconfig = parseKubeconfig(kubeconfigYaml, 'generated');
  const users = getNamedEntries<KubeUser>(kubeconfig, 'users');
  return users.some(user => {
    const exec = user.user?.exec;
    if (typeof exec !== 'object' || exec === null || Array.isArray(exec)) {
      return false;
    }
    const command = (exec as Record<string, unknown>).command;
    if (!isNonEmptyString(command)) {
      return false;
    }
    const executable = path.posix.basename(command.replaceAll('\\', '/')).toLowerCase();
    return executable === 'kubelogin' || executable === 'kubelogin.exe';
  });
}

function parseKubeconfig(config: string, source: string): KubeConfig {
  if (!config.trim()) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = yaml.parse(config);
  } catch {
    throw new Error(`Failed to parse ${source} kubeconfig`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Failed to parse ${source} kubeconfig`);
  }
  return parsed as KubeConfig;
}

function getNamedEntries<T extends NamedKubeConfigEntry>(
  config: KubeConfig,
  key: 'clusters' | 'contexts' | 'users'
): T[] {
  const entries = config[key];
  if (entries === undefined) {
    const empty: T[] = [];
    config[key] = empty;
    return empty;
  }
  if (
    !Array.isArray(entries) ||
    entries.some(
      entry => typeof entry !== 'object' || entry === null || !isNonEmptyString(entry.name)
    )
  ) {
    throw new Error(`Invalid ${key} in kubeconfig`);
  }
  const names = new Set<string>();
  for (const entry of entries) {
    if (names.has(entry.name)) {
      throw new Error(`Duplicate ${key} name in kubeconfig`);
    }
    names.add(entry.name);
  }
  return entries as T[];
}

/**
 * Merge a new cluster config into the existing kubeconfig.
 */
export function mergeKubeconfig(existingConfig: string, newConfig: string): KubeConfig {
  const existing = parseKubeconfig(existingConfig, 'existing');
  const newCfg = parseKubeconfig(newConfig, 'generated');
  const existingClusters = getNamedEntries<KubeCluster>(existing, 'clusters');
  const newClusters = getNamedEntries<KubeCluster>(newCfg, 'clusters');
  const existingContexts = getNamedEntries<KubeContext>(existing, 'contexts');
  const newContexts = getNamedEntries<KubeContext>(newCfg, 'contexts');
  const existingUsers = getNamedEntries<KubeUser>(existing, 'users');
  const newUsers = getNamedEntries<KubeUser>(newCfg, 'users');
  const replacedContextNames = new Set(newContexts.map(context => context.name));

  // Merge clusters
  for (const cluster of newClusters) {
    const idx = existingClusters.findIndex(candidate => candidate.name === cluster.name);
    if (idx >= 0) {
      const existingServer = existingClusters[idx].cluster?.server;
      const newServer = cluster.cluster?.server;
      if (!isNonEmptyString(existingServer) || existingServer !== newServer) {
        throw new Error(`Cluster '${cluster.name}' already uses a different API server`);
      }
      const preservedContextUsesCluster = existingContexts.some(
        context =>
          context.context?.cluster === cluster.name && !replacedContextNames.has(context.name)
      );
      if (
        preservedContextUsesCluster &&
        !isDeepStrictEqual(existingClusters[idx].cluster, cluster.cluster)
      ) {
        throw new Error(`Cluster '${cluster.name}' is already referenced by another context`);
      }
      existingClusters[idx] = cluster;
    } else {
      existingClusters.push(cluster);
    }
  }

  // Merge contexts
  for (const context of newContexts) {
    const idx = existingContexts.findIndex(candidate => candidate.name === context.name);
    if (idx >= 0) {
      if (!isDeepStrictEqual(existingContexts[idx].context, context.context)) {
        throw new Error(`Context '${context.name}' already has different configuration`);
      }
      existingContexts[idx] = context;
    } else {
      existingContexts.push(context);
    }
  }

  // Merge users
  for (const user of newUsers) {
    const idx = existingUsers.findIndex(candidate => candidate.name === user.name);
    if (idx >= 0) {
      const replacedContexts = new Set(
        newContexts
          .filter(context => context.context?.user === user.name)
          .map(context => context.name)
      );
      const preservedContextUsesUser = existingContexts.some(
        context => context.context?.user === user.name && !replacedContexts.has(context.name)
      );
      if (preservedContextUsesUser && !isDeepStrictEqual(existingUsers[idx].user, user.user)) {
        throw new Error(`User '${user.name}' is already referenced by another context`);
      }
      existingUsers[idx] = user;
    } else {
      existingUsers.push(user);
    }
  }

  // Set current context to the new cluster
  if (newCfg['current-context']) {
    existing['current-context'] = newCfg['current-context'];
  }

  return existing;
}

/**
 * Builds the effective named-entry view of a kubeconfig search path.
 *
 * Earlier files win when multiple files define the same named entry, matching
 * kubeconfig loading precedence while retaining references split across files.
 *
 * @param configs - Existing kubeconfig files in search-path order.
 * @returns Effective clusters, contexts, users, and current context.
 */
function effectiveKubeconfig(configs: string[]): KubeConfig {
  const effective: KubeConfig = { clusters: [], contexts: [], users: [] };
  for (const [index, contents] of configs.entries()) {
    const config = parseKubeconfig(contents, `KUBECONFIG entry ${index + 1}`);
    for (const key of ['clusters', 'contexts', 'users'] as const) {
      const destination = getNamedEntries<NamedKubeConfigEntry>(effective, key);
      for (const entry of getNamedEntries<NamedKubeConfigEntry>(config, key)) {
        if (!destination.some(candidate => candidate.name === entry.name)) {
          destination.push(entry);
        }
      }
    }
    if (
      !isNonEmptyString(effective['current-context']) &&
      isNonEmptyString(config['current-context'])
    ) {
      effective['current-context'] = config['current-context'];
    }
  }
  return effective;
}

/**
 * Validates that generated credentials contain one coherent selected identity.
 *
 * @param kubeconfigYaml - Generated provider kubeconfig YAML.
 * @returns Nothing.
 * @throws When current context, references, API server, or user data is missing.
 */
export function validateGeneratedKubeconfig(kubeconfigYaml: string): void {
  const config = parseKubeconfig(kubeconfigYaml, 'generated');
  const clusters = getNamedEntries<KubeCluster>(config, 'clusters');
  const contexts = getNamedEntries<KubeContext>(config, 'contexts');
  const users = getNamedEntries<KubeUser>(config, 'users');
  const currentContext = config['current-context'];
  if (!isNonEmptyString(currentContext)) {
    throw new Error('Generated kubeconfig has no current context');
  }
  const context = contexts.find(candidate => candidate.name === currentContext);
  if (!context || !isNonEmptyString(context.context?.cluster)) {
    throw new Error(`Generated kubeconfig context '${currentContext}' has no cluster`);
  }
  if (!isNonEmptyString(context.context?.user)) {
    throw new Error(`Generated kubeconfig context '${currentContext}' has no user`);
  }
  const cluster = clusters.find(candidate => candidate.name === context.context?.cluster);
  if (!cluster || !isNonEmptyString(cluster.cluster?.server)) {
    throw new Error(`Generated kubeconfig cluster '${context.context.cluster}' has no API server`);
  }
  let server: URL;
  try {
    if (cluster.cluster.server !== cluster.cluster.server.trim()) throw new Error();
    server = new URL(cluster.cluster.server);
  } catch {
    throw new Error(
      `Generated kubeconfig cluster '${context.context.cluster}' has invalid API server`
    );
  }
  if (
    !['http:', 'https:'].includes(server.protocol) ||
    server.username !== '' ||
    server.password !== '' ||
    server.search !== '' ||
    server.hash !== ''
  ) {
    throw new Error(
      `Generated kubeconfig cluster '${context.context.cluster}' has invalid API server`
    );
  }
  const user = users.find(candidate => candidate.name === context.context?.user);
  if (
    typeof user?.user !== 'object' ||
    user.user === null ||
    Array.isArray(user.user) ||
    Object.keys(user.user).length === 0
  ) {
    throw new Error(`Generated kubeconfig user '${context.context.user}' is missing`);
  }
  if (clusters.length !== 1) {
    throw new Error('Generated kubeconfig contains unrelated clusters');
  }
  if (contexts.length !== 1) {
    throw new Error('Generated kubeconfig contains unrelated contexts');
  }
  if (users.length !== 1) {
    throw new Error('Generated kubeconfig contains unrelated users');
  }
}

/**
 * Resolves the complete kubeconfig search path and writable destination.
 *
 * @param kubeconfigEnvironment - Raw KUBECONFIG value.
 * @param homeDirectory - User home used for the default path.
 * @returns Ordered non-empty paths; the first path is the destination.
 */
export function resolveKubeconfigPaths(
  kubeconfigEnvironment: string | undefined = process.env.KUBECONFIG,
  homeDirectory: string = os.homedir()
): string[] {
  const configured = kubeconfigEnvironment
    ?.split(path.delimiter)
    .filter(candidate => candidate !== '');
  return configured?.length ? configured : [path.join(homeDirectory, '.kube', 'config')];
}

/**
 * Enforces owner-only access on a completed temporary credential file.
 *
 * @param filePath - Credential file to protect before atomic replacement.
 * @param platform - Host platform, overridable for tests.
 * @param runUtility - Shell-free local utility runner, overridable for tests.
 * @returns Nothing.
 * @throws When the Windows identity cannot be resolved or ACL application fails.
 */
export function enforcePrivateFilePermissions(
  filePath: string,
  platform: NodeJS.Platform = process.platform,
  runUtility: RunLocalUtility = runLocalUtility
): void {
  if (platform !== 'win32') {
    fs.chmodSync(filePath, 0o600);
    return;
  }
  const identity = runUtility('whoami', []).trim();
  if (!identity) {
    throw new Error('Unable to determine the current Windows identity');
  }
  runUtility('icacls', [filePath, '/inheritance:r', '/grant:r', `${identity}:(F)`]);
}

/**
 * Enforces owner-only access on a credential directory and newly created children.
 *
 * @param directoryPath - Directory to protect before a provider writes credentials.
 * @param platform - Host platform, overridable for tests.
 * @param runUtility - Shell-free local utility runner, overridable for tests.
 * @returns Nothing.
 * @throws When the Windows identity cannot be resolved or ACL application fails.
 */
export function enforcePrivateDirectoryPermissions(
  directoryPath: string,
  platform: NodeJS.Platform = process.platform,
  runUtility: RunLocalUtility = runLocalUtility
): void {
  if (platform !== 'win32') {
    fs.chmodSync(directoryPath, 0o700);
    return;
  }
  const identity = runUtility('whoami', []).trim();
  if (!identity) {
    throw new Error('Unable to determine the current Windows identity');
  }
  runUtility('icacls', [directoryPath, '/inheritance:r', '/grant:r', `${identity}:(OI)(CI)F`]);
}

/**
 * Atomically replaces a completed credential file on the current platform.
 *
 * @param sourcePath - Completed private sibling file.
 * @param destinationPath - Credential file to create or replace.
 * @param platform - Host platform, overridable for tests.
 * @param runUtility - Shell-free local utility runner, overridable for tests.
 * @returns Nothing.
 * @throws When the operating system cannot atomically replace the destination.
 */
export function replaceFileAtomically(
  sourcePath: string,
  destinationPath: string,
  platform: NodeJS.Platform = process.platform,
  runUtility: RunLocalUtility = runLocalUtility
): void {
  if (platform !== 'win32') {
    fs.renameSync(sourcePath, destinationPath);
    return;
  }
  const encodedSource = Buffer.from(sourcePath, 'utf8').toString('base64');
  const encodedDestination = Buffer.from(destinationPath, 'utf8').toString('base64');
  const script = [
    `$sourcePath = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodedSource}'))`,
    `$destinationPath = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodedDestination}'))`,
    '$native = Add-Type -Name NativeMethods -Namespace Headlamp -MemberDefinition \'[System.Runtime.InteropServices.DllImport("kernel32.dll", EntryPoint = "MoveFileExW", SetLastError = true, CharSet = System.Runtime.InteropServices.CharSet.Unicode)] public static extern bool MoveFileEx(string existingFileName, string newFileName, int flags);\' -PassThru',
    'if (-not $native::MoveFileEx($sourcePath, $destinationPath, 9)) {',
    '  $code = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()',
    '  throw "MoveFileExW failed with Win32 error $code"',
    '}',
  ].join('; ');
  const encodedScript = Buffer.from(script, 'utf16le').toString('base64');
  runUtility('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-EncodedCommand',
    encodedScript,
  ]);
}

/** In-process queues protecting each destination's complete read-merge-write transaction. */
const kubeconfigWriteQueues = new Map<string, Promise<void>>();

/**
 * Resolves a writable kubeconfig path while preserving an existing symbolic link.
 *
 * @param kubeconfigPath - Configured writable path.
 * @returns Original path for a regular or absent file, or canonical symlink target.
 * @throws When an existing symbolic link has no resolvable target.
 */
function resolveKubeconfigDestination(kubeconfigPath: string): string {
  let fileType: fs.Stats;
  try {
    fileType = fs.lstatSync(kubeconfigPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return kubeconfigPath;
    }
    throw error;
  }
  return fileType.isSymbolicLink() ? fs.realpathSync(kubeconfigPath) : kubeconfigPath;
}

/**
 * Runs one complete destination update after prior updates for that target finish.
 *
 * @param kubeconfigPath - Configured destination, which may be a symbolic link.
 * @param operation - Read-merge-write transaction to run with the canonical destination.
 * @returns The operation result.
 */
async function withKubeconfigWriteLock<T>(
  kubeconfigPath: string,
  operation: (destination: string) => Promise<T> | T
): Promise<T> {
  const destination = resolveKubeconfigDestination(kubeconfigPath);
  const previous = kubeconfigWriteQueues.get(destination) ?? Promise.resolve();
  let release = () => {};
  const current = new Promise<void>(resolve => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  kubeconfigWriteQueues.set(destination, queued);
  await previous;
  try {
    return await operation(destination);
  } finally {
    release();
    if (kubeconfigWriteQueues.get(destination) === queued) {
      kubeconfigWriteQueues.delete(destination);
    }
  }
}

export function writeKubeconfigAtomically(
  kubeconfigPath: string,
  contents: string,
  replaceFile: ReplaceCredentialFile = replaceFileAtomically,
  platform: NodeJS.Platform = process.platform,
  hardenFile: HardenCredentialFile = filePath => enforcePrivateFilePermissions(filePath, platform)
): void {
  const destination = resolveKubeconfigDestination(kubeconfigPath);
  const temporaryPath = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.${randomUUID()}.tmp`
  );
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporaryPath, 'wx', 0o600);
    hardenFile(temporaryPath);
    fs.writeFileSync(descriptor, contents, 'utf8');
    if (platform !== 'win32') {
      fs.fchmodSync(descriptor, 0o600);
    }
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    replaceFile(temporaryPath, destination);
    if (platform !== 'win32') {
      try {
        const directoryDescriptor = fs.openSync(path.dirname(destination), 'r');
        try {
          fs.fsyncSync(directoryDescriptor);
        } finally {
          fs.closeSync(directoryDescriptor);
        }
      } catch {
        console.error('[AKS] Kubeconfig replaced but parent directory sync failed');
      }
    }
  } finally {
    if (descriptor !== undefined) {
      fs.closeSync(descriptor);
    }
    fs.rmSync(temporaryPath, { force: true });
  }
}

/**
 * Collision-checks and atomically merges generated credentials under a destination lock.
 *
 * @param modifiedKubeconfig - Validated provider-generated kubeconfig YAML.
 * @param kubeconfigPaths - Ordered KUBECONFIG search path; the first entry is writable.
 * @returns Canonical destination that was updated.
 */
export async function mergeKubeconfigTransaction(
  modifiedKubeconfig: string,
  kubeconfigPaths: string[]
): Promise<string> {
  return withKubeconfigWriteLock(kubeconfigPaths[0], kubeconfigPath => {
    const kubeconfigDir = path.dirname(kubeconfigPath);
    if (!fs.existsSync(kubeconfigDir)) {
      fs.mkdirSync(kubeconfigDir, { recursive: true, mode: 0o700 });
    }
    const existingKubeconfig = fs.existsSync(kubeconfigPath)
      ? fs.readFileSync(kubeconfigPath, 'utf8')
      : '';
    const existingSearchPath = kubeconfigPaths
      .filter(collisionPath => fs.existsSync(collisionPath))
      .map(collisionPath => fs.readFileSync(collisionPath, 'utf8'));
    if (existingSearchPath.length > 0) {
      mergeKubeconfig(yaml.stringify(effectiveKubeconfig(existingSearchPath)), modifiedKubeconfig);
    }
    const finalKubeconfig = yaml.stringify(
      mergeKubeconfig(existingKubeconfig, modifiedKubeconfig),
      { lineWidth: 0, defaultStringType: 'QUOTE_DOUBLE' }
    );
    writeKubeconfigAtomically(kubeconfigPath, finalKubeconfig);
    return kubeconfigPath;
  });
}

/**
 * Registers an AKS or Arc cluster through the built-in Azure provider.
 *
 * @param options - Validated Azure provider options.
 * @param runtime - Product-resolved paths for the provider's external tools.
 * @param hardenCredentialDirectory - Protects temporary credentials before provider execution.
 * @param cleanupCredentialDirectory - Removes temporary credentials after provider execution.
 * @returns Registration result with user-facing detail.
 */
export async function registerAzureCluster(
  options: AzureClusterRegistrationOptions,
  runtime: ClusterRegistrationRuntime,
  hardenCredentialDirectory: HardenCredentialDirectory = enforcePrivateDirectoryPermissions,
  cleanupCredentialDirectory: CleanupCredentialDirectory = directoryPath =>
    fs.rmSync(directoryPath, { recursive: true, force: true })
): Promise<ClusterRegistrationResult> {
  const {
    subscriptionId,
    resourceGroup,
    clusterName,
    isAzureRBACEnabled,
    managedNamespace,
    clusterType = 'aks',
  } = options;
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-kubeconfig-'));
  const tempKubeconfigPath = path.join(temporaryDirectory, 'config');
  let persistenceCommitted = false;

  try {
    hardenCredentialDirectory(temporaryDirectory);

    // Step 1: Get the kubeconfig to a temporary file
    const args: string[] = [];

    if (clusterType === 'aksarc') {
      console.log('[AKS ARC] Getting credentials for cluster:', clusterName);
      args.push(
        'aksarc',
        'get-credentials',
        '--subscription',
        subscriptionId,
        '--resource-group',
        resourceGroup,
        '--name',
        clusterName
      );
    } else if (managedNamespace) {
      // Use namespace get-credentials if a managed namespace is provided
      args.push('aks');
      console.log(
        '[AKS] Getting namespace credentials for cluster:',
        clusterName,
        'namespace:',
        managedNamespace
      );
      args.push(
        'namespace',
        'get-credentials',
        '--cluster-name',
        clusterName,
        '--resource-group',
        resourceGroup,
        '--name',
        managedNamespace,
        '--subscription',
        subscriptionId
      );
    } else {
      console.log('[AKS] Getting credentials for cluster:', clusterName);
      args.push('aks');
      args.push(
        'get-credentials',
        '--subscription',
        subscriptionId,
        '--resource-group',
        resourceGroup,
        '--name',
        clusterName
      );
    }

    args.push('--file', tempKubeconfigPath);

    try {
      const { azCliCmd } = getExecutablePaths(runtime);
      const result = await executeCommandWithShellEnvironment(azCliCmd, args);

      if (result.code !== 0) {
        console.error(`[AKS] Azure CLI credential retrieval failed with exit code ${result.code}`);
        return {
          success: false,
          message: 'Failed to get cluster credentials.',
        };
      }
    } catch {
      console.error('[AKS] Azure CLI credential retrieval failed to start');
      return {
        success: false,
        message: 'Failed to get cluster credentials.',
      };
    }

    if (!fs.existsSync(tempKubeconfigPath)) {
      return {
        success: false,
        message: 'Failed to create temporary kubeconfig file',
      };
    }

    console.log('[AKS] Temporary kubeconfig created:', tempKubeconfigPath);

    // Step 2: Read and modify the temporary kubeconfig
    const tempKubeconfig = fs.readFileSync(tempKubeconfigPath, 'utf8');
    let modifiedKubeconfig: string;
    if (isAzureRBACEnabled || kubeconfigUsesKubelogin(tempKubeconfig)) {
      console.log('[AKS] Adding az-kubelogin to kubeconfig since Azure RBAC is enabled');
      modifiedKubeconfig = addAzKubeloginToKubeconfig(tempKubeconfig, runtime);
    } else {
      console.log('[AKS] Skipping az-kubelogin since Azure RBAC is disabled');
      modifiedKubeconfig = tempKubeconfig;
    }
    validateGeneratedKubeconfig(modifiedKubeconfig);

    // Step 3: Merge into main kubeconfig
    // Use the first non-empty path from $KUBECONFIG if set,
    // otherwise default to ~/.kube/config
    const kubeconfigPaths = resolveKubeconfigPaths();
    const kubeconfigPath = await mergeKubeconfigTransaction(modifiedKubeconfig, kubeconfigPaths);
    persistenceCommitted = true;
    console.log('[AKS] Cluster registered successfully');
    return {
      success: true,
      message: `Cluster '${clusterName}' registered successfully. Kubeconfig written to ${kubeconfigPath}`,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('[AKS] Error registering cluster:', message);

    return {
      success: false,
      message,
    };
  } finally {
    try {
      cleanupCredentialDirectory(temporaryDirectory);
    } catch {
      console.error(
        persistenceCommitted
          ? '[AKS] Temporary credential cleanup failed after registration committed'
          : '[AKS] Temporary credential cleanup failed'
      );
    }
  }
}

/** Built-in provider for AKS and Arc-connected credentials retrieved through Azure CLI. */
export const azureClusterRegistrationProvider: ClusterRegistrationProvider<AzureClusterRegistrationOptions> =
  {
    id: 'azure',
    validateOptions: isAzureClusterRegistrationOptions,
    register: registerAzureCluster,
  };

/** Native providers enabled by the default Headlamp desktop application. */
export const clusterRegistrationProviders: readonly ClusterRegistrationProvider[] = [
  azureClusterRegistrationProvider,
];

/**
 * Dispatches a provider-neutral registration request to a native provider.
 *
 * New providers implement {@link ClusterRegistrationProvider}, validate their opaque options,
 * and are added to the provider list supplied by the application entry point.
 *
 * @param providerId - Stable provider ID supplied by the plugin.
 * @param options - Untrusted provider-defined options.
 * @param runtime - Product-resolved provider runtime.
 * @param providers - Native providers available to this application.
 * @returns Registration result with user-facing detail.
 */
export async function registerCluster(
  providerId: string,
  options: unknown,
  runtime: ClusterRegistrationRuntime,
  providers: readonly ClusterRegistrationProvider[] = clusterRegistrationProviders
): Promise<ClusterRegistrationResult> {
  const matchingProviders = providers.filter(candidate => candidate.id === providerId);
  if (matchingProviders.length === 0) {
    return {
      success: false,
      message: `Cluster registration provider '${providerId}' is unavailable.`,
    };
  }
  if (matchingProviders.length > 1) {
    return {
      success: false,
      message: `Cluster registration provider '${providerId}' is ambiguously configured.`,
    };
  }
  const provider = matchingProviders[0];
  let validOptions = false;
  try {
    validOptions = provider.validateOptions(options);
  } catch {
    validOptions = false;
  }
  if (!validOptions) {
    return {
      success: false,
      message: `Invalid options for cluster registration provider '${providerId}'.`,
    };
  }
  let result: unknown;
  try {
    result = await provider.register(options, runtime);
  } catch {
    return {
      success: false,
      message: `Cluster registration provider '${providerId}' failed.`,
    };
  }
  if (
    typeof result !== 'object' ||
    result === null ||
    Array.isArray(result) ||
    typeof (result as Record<string, unknown>).success !== 'boolean' ||
    typeof (result as Record<string, unknown>).message !== 'string'
  ) {
    return {
      success: false,
      message: `Cluster registration provider '${providerId}' returned an invalid result.`,
    };
  }
  return {
    success: (result as ClusterRegistrationResult).success,
    message: (result as ClusterRegistrationResult).message,
  };
}

/**
 * Registers the capability-protected cluster registration IPC handler.
 *
 * @param mainWindow - Desktop window owning the trusted renderer.
 * @param ipcMain - Electron IPC registrar.
 * @param authorize - Main-process authorization for an attested plugin capability.
 * @param manifest - Runtime product manifest containing external-tool records.
 * @param resourcesPath - Root of the packaged application resources.
 * @param trustedStartUrl - Renderer document URL allowed to invoke registration.
 * @param providers - Native providers available to this application.
 * @returns Nothing.
 */
export function setupClusterRegistrationHandler(
  mainWindow: BrowserWindow,
  ipcMain: Electron.IpcMain,
  authorize: AuthorizeClusterRegistration | undefined,
  manifest: BuildManifest,
  resourcesPath: string,
  trustedStartUrl: string,
  providers: readonly ClusterRegistrationProvider[] = clusterRegistrationProviders
): void {
  ipcMain.removeHandler('register-cluster');
  ipcMain.handle('register-cluster', async (event, data: unknown) => {
    if (
      event.sender !== mainWindow.webContents ||
      event.senderFrame !== mainWindow.webContents.mainFrame ||
      !isTrustedDocumentUrl(event.senderFrame.url, trustedStartUrl)
    ) {
      return { success: false, message: 'Cluster registration request was rejected.' };
    }
    if (!isClusterRegistrationRequest(data) || !authorize) {
      return { success: false, message: 'Invalid cluster registration request.' };
    }
    const configuration = authorize(event, data.provider, data.capabilitySecret);
    if (!configuration) {
      return { success: false, message: 'Cluster registration request was rejected.' };
    }
    let runtime: ClusterRegistrationRuntime;
    try {
      runtime = resolveClusterRegistrationRuntime(manifest, configuration, resourcesPath);
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Invalid cluster registration provider',
      };
    }
    return registerCluster(configuration.type, data.options, runtime, providers);
  });
}

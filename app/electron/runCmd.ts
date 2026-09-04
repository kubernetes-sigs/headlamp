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

import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { BrowserWindow, dialog } from 'electron';
import { IpcMainEvent } from 'electron/main';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'path';
import i18n from './i18next.config';
import {
  defaultPluginsDir,
  defaultUserPluginsDir,
  PREPARED_PLUGIN_SCRIPTS_PATH,
  preparePluginExecutable,
  preparePluginScript,
  removePreparedPluginExecutable,
  removePreparedPluginScript,
  verifyPluginInstallationIntegrity,
} from './plugin-management';
import { isRunCommandAllowed, RunCommandGrant } from './runCommandPolicy';
import { isTrustedDocumentUrl } from './secureStorage';
import { loadSettings, saveSettings, SETTINGS_PATH } from './settings';

/**
 * Data sent from the renderer process when a 'run-command' event is emitted.
 */
interface CommandData {
  /** The unique ID of the command. */
  id: string;
  /** The command to run. */
  command: string;
  /** The arguments to pass to the command. */
  args: string[];
  /**
   * Options to pass to the command.
   * See https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options
   */
  options: {};
  /** The permission secrets for the command. */
  permissionSecrets: Record<string, number>;
  /** Opaque capability for a product-authorized plugin. */
  capability?: string;
}

/**
 * Product-owned command policy for a plugin identity.
 *
 * @example Allow a shipped plugin to list projects.
 * ```ts
 * const policy: ProductPluginCommandPolicy = {
 *   bundleName: 'example-plugin',
 *   packageName: '@example/plugin',
 *   source: 'shipped',
 *   grants: [{ tool: 'examplectl', args: ['project', 'list'] }],
 * };
 * ```
 */
export interface ProductPluginCommandPolicy {
  /** Bundle directory name from the product manifest. */
  bundleName: string;
  /** Expected package name from the product manifest. */
  packageName: string;
  /** Inventory containing the authorized plugin. */
  source: 'development' | 'user' | 'shipped';
  /** App-owned installation provenance required for managed plugin inventories. */
  artifactHub?: {
    repository: string;
    package: string;
    packageId?: string;
    repositoryId?: string;
  };
  /** Reviewed command grants for the plugin. */
  grants: RunCommandGrant[];
}

// Keep these IPC contract interfaces in sync with frontend/src/plugin/commandCapabilities.ts.

/**
 * Plugin provenance sent to Electron before third-party code executes.
 *
 * @example Report a plugin discovered in the shipped inventory.
 * ```ts
 * const registration: PluginCommandRegistration = {
 *   bundleName: 'example-plugin',
 *   packageName: '@example/plugin',
 *   path: 'static-plugins/example-plugin',
 *   source: 'shipped',
 *   type: 'shipped',
 *   sourceDigest: 'dd746362bdf7510734ba74a34f15e2a6a625e7e044efb0bc38da54b7cc316084',
 * };
 * ```
 */
export interface PluginCommandRegistration {
  /** Bundle directory reported by backend discovery. */
  bundleName: string;
  /** Package identity read from the plugin bundle. */
  packageName: string;
  /** URL path used to load the plugin. */
  path: string;
  /** Inventory root containing the plugin. */
  source: string;
  /** Plugin priority type. */
  type: string;
  /** SHA-256 of the exact main.js source cached by the trusted renderer. */
  sourceDigest: string;
}

/**
 * Command authorization issued by Electron for one verified plugin.
 *
 * The capability is a random 32-byte secret represented as 64 hexadecimal characters. Electron
 * stores which plugin identity and command grants belong to that secret. The renderer includes it
 * with each command request, allowing Electron to reject requests that have no token, use a
 * revoked token, or request a command outside that plugin's grants.
 *
 * The token contains no readable plugin or permission data; plugin code must not interpret or
 * create it.
 *
 * @example A capability returned by Electron for a verified plugin.
 * ```ts
 * const commandCapability: PluginCommandCapability = {
 *   bundleName: 'example-plugin',
 *   packageName: '@example/plugin',
 *   capability: '4f8c2a917bd03e65a1c94f286e5b70d39ac214ef53d8b607c1e49a728f306db5',
 * };
 * ```
 */
export interface PluginCommandCapability {
  /** Bundle directory bound to the capability. */
  bundleName: string;
  /** Package identity bound to the capability. */
  packageName: string;
  /** Opaque authorization token. */
  capability: string;
}

/** Command capability state retained only by Electron's main process. */
export interface RegisteredPluginCommandCapability extends ProductPluginCommandPolicy {
  /** Renderer web contents that owns the capability. */
  webContentsId: number;
}

type PluginRoots = Record<ProductPluginCommandPolicy['source'], string>;

type RunCmdIpcListeners = {
  requestPermissionSecrets: () => void;
  revokeCapabilities: () => void;
  runCommand: (event: IpcMainEvent, eventData: CommandDataPartial) => Promise<void>;
};

const runCmdIpcListeners = new WeakMap<Electron.IpcMain, RunCmdIpcListeners>();

type PluginConsentIdentity = Pick<
  RegisteredPluginCommandCapability,
  'source' | 'packageName' | 'bundleName'
>;

/**
 * Filters product command policies to plugins currently installed in their declared inventories.
 *
 * The product manifest expresses which plugin identities may run commands, but renderer-reported
 * plugin provenance is untrusted. Before a capability can be issued, this function independently
 * verifies each policy against plugin files visible to Electron's main process. It:
 *
 * - selects the inventory root declared by `policy.source`;
 * - requires `policy.bundleName` to resolve inside that inventory;
 * - rejects symbolic links for both the bundle directory and its `package.json`;
 * - verifies the canonical bundle path remains inside the canonical inventory root; and
 * - requires the package name in `package.json` to equal `policy.packageName` exactly.
 *
 * Missing inventories, absent bundles, malformed package metadata, and filesystem errors fail
 * closed: the affected policy is omitted from the returned array rather than causing registration
 * to throw. The function neither issues capabilities nor mutates policies. Capability registration
 * subsequently intersects this verified result with the renderer's discovery report.
 *
 * Verification occurs when the trusted renderer registers plugins, not only at Electron startup.
 * This allows an authorized development or user plugin installed after startup to become eligible
 * after a renderer reload while still checking its files immediately before capability issuance.
 * The development inventory is operator-controlled by threat-model definition and therefore does
 * not require plugin-manager provenance; policies for user inventory can additionally require the
 * installer receipt through `policy.artifactHub`.
 *
 * @param policies - Structurally validated policies loaded from the product manifest.
 * @param registrations - Untrusted discovery claims including the trusted renderer's source hash.
 * @param pluginRoots - Main-process filesystem root for each plugin inventory.
 * @returns Policies whose installed bundle and package identity pass every verification check.
 */
export async function verifyPluginCommandPolicies(
  policies: ProductPluginCommandPolicy[],
  registrations: unknown,
  pluginRoots: PluginRoots = defaultPluginRoots()
): Promise<ProductPluginCommandPolicy[]> {
  const verifiedPolicies: ProductPluginCommandPolicy[] = [];
  const registrationList = Array.isArray(registrations) ? registrations : [];
  for (const policy of policies) {
    const pluginRoot = pluginRoots[policy.source];
    let canonicalRoot: string;
    try {
      canonicalRoot = fs.realpathSync(pluginRoot);
    } catch {
      continue;
    }
    const bundlePath = path.resolve(pluginRoot, policy.bundleName);
    const relativeBundlePath = path.relative(pluginRoot, bundlePath);
    // Catalog plugins awaiting migration can have user priority while still
    // residing in the development inventory, so validate these independently.
    if (
      relativeBundlePath === '' ||
      relativeBundlePath === '..' ||
      relativeBundlePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeBundlePath)
    ) {
      continue;
    }

    try {
      const bundleStat = fs.lstatSync(bundlePath);
      const packageFile = path.join(bundlePath, 'package.json');
      const packageStat = fs.lstatSync(packageFile);
      if (
        !bundleStat.isDirectory() ||
        bundleStat.isSymbolicLink() ||
        !packageStat.isFile() ||
        packageStat.isSymbolicLink()
      ) {
        continue;
      }
      const canonicalBundle = fs.realpathSync(bundlePath);
      const relativeCanonicalBundle = path.relative(canonicalRoot, canonicalBundle);
      if (
        relativeCanonicalBundle === '' ||
        relativeCanonicalBundle === '..' ||
        relativeCanonicalBundle.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativeCanonicalBundle)
      ) {
        continue;
      }
      const packageInfo = JSON.parse(fs.readFileSync(packageFile, 'utf8')) as unknown;
      if (
        typeof packageInfo !== 'object' ||
        packageInfo === null ||
        Array.isArray(packageInfo) ||
        (packageInfo as { name?: unknown }).name !== policy.packageName
      ) {
        continue;
      }
      const expectedPath = `${
        { development: 'plugins', user: 'user-plugins', shipped: 'static-plugins' }[policy.source]
      }/${policy.bundleName}`;
      const matchingRegistrations = registrationList.filter(candidate => {
        if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
          return false;
        }
        const registration = candidate as Partial<PluginCommandRegistration>;
        return (
          registration.source === policy.source &&
          registration.bundleName === policy.bundleName &&
          registration.packageName === policy.packageName &&
          typeof registration.path === 'string' &&
          registration.path.replaceAll('\\', '/') === expectedPath &&
          /^[a-f0-9]{64}$/.test(registration.sourceDigest ?? '')
        );
      });
      if (matchingRegistrations.length !== 1) continue;
      const mainFile = path.join(bundlePath, 'main.js');
      const mainStat = fs.lstatSync(mainFile);
      if (mainStat.isSymbolicLink() || !mainStat.isFile()) continue;
      const canonicalMain = fs.realpathSync(mainFile);
      if (path.dirname(canonicalMain) !== canonicalBundle) continue;
      const sourceDigest = crypto
        .createHash('sha256')
        .update(fs.readFileSync(canonicalMain, 'utf8'))
        .digest('hex');
      if (sourceDigest !== matchingRegistrations[0].sourceDigest) continue;
      if (
        policy.artifactHub === undefined ||
        (await verifyPluginInstallationIntegrity(bundlePath, policy.artifactHub))
      ) {
        verifiedPolicies.push(policy);
      }
    } catch {
      continue;
    }
  }
  return verifiedPolicies;
}

/** Returns only values changed by shell initialization. */
export function environmentOverrides(
  environment: NodeJS.ProcessEnv,
  currentEnvironment: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(environment).filter(([key, value]) => currentEnvironment[key] !== value)
  );
}

/**
 * Ask the user with an electron dialog if they want to allow the command
 * to be executed.
 * @param command - The command to show in the dialog.
 * @param mainWindow - The main window to show the dialog on.
 *
 * @returns true if the user allows the command to be executed, false otherwise.
 */
function confirmCommandDialog(command: string, mainWindow: BrowserWindow): boolean {
  if (mainWindow === null) {
    return false;
  }
  const resp = dialog.showMessageBoxSync(mainWindow, {
    title: i18n.t('Consent to command being run'),
    message: i18n.t('Allow this local command to be executed? Your choice will be saved.'),
    detail: command,
    type: 'question',
    buttons: [i18n.t('Allow'), i18n.t('Deny')],
  });

  return resp === 0;
}

/**
 * Checks if the user has already consented to running the command.
 *
 * If the user has not consented, a dialog is shown to ask for consent.
 *
 * @param command - The command to check.
 * @param args - The arguments to the command.
 * @returns true if the user has consented to running the command, false otherwise.
 */
function checkCommandConsent(
  command: string,
  args: string[],
  mainWindow: BrowserWindow,
  pluginIdentity?: PluginConsentIdentity,
  consentArgs: string[] = args.slice(0, 1)
): boolean {
  const settings = loadSettings(SETTINGS_PATH);
  const confirmedCommands = settings?.confirmedCommands;

  // Product grants use their reviewed argument prefix so saved consent cannot
  // become broader when a request adds trailing arguments.
  const pluginLabel = pluginIdentity
    ? `${pluginIdentity.packageName}@${pluginIdentity.bundleName}`
    : undefined;
  const consentIdentity = pluginIdentity
    ? {
        source: pluginIdentity.source,
        packageName: pluginIdentity.packageName,
        bundleName: pluginIdentity.bundleName,
      }
    : undefined;
  let displayCommand = pluginLabel ? `${pluginLabel}: ${command}` : command;
  if (consentArgs.length > 0) {
    displayCommand += ' ' + consentArgs.join(' ');
  }
  const consentKey = pluginIdentity
    ? `run-command-consent:v2:${JSON.stringify([consentIdentity, command, consentArgs])}`
    : displayCommand;
  const previousPluginConsentKey = pluginLabel
    ? `run-command-consent:v1:${JSON.stringify([pluginLabel, command, consentArgs])}`
    : undefined;
  const legacyConsentKey = [command, ...args.slice(0, 1)].join(' ');
  const legacyPluginCommands = pluginIdentity
    ? LEGACY_CONSENT_PLUGIN_COMMANDS.get(
        `${pluginIdentity.source}\0${pluginIdentity.packageName}\0${pluginIdentity.bundleName}`
      )
    : undefined;
  const mayUseScopedLegacyConsent = !pluginIdentity || legacyPluginCommands !== undefined;
  const mayUseSourceLessLegacyConsent =
    !pluginIdentity || legacyPluginCommands?.has(legacyConsentKey) === true;

  const savedCommand: boolean | undefined = confirmedCommands
    ? confirmedCommands[consentKey] ??
      (mayUseScopedLegacyConsent && previousPluginConsentKey
        ? confirmedCommands[previousPluginConsentKey]
        : undefined) ??
      (mayUseScopedLegacyConsent ? confirmedCommands[displayCommand] : undefined) ??
      (mayUseSourceLessLegacyConsent ? confirmedCommands[legacyConsentKey] : undefined)
    : undefined;

  if (savedCommand === false) {
    console.error(`Invalid command: ${consentKey}, command not allowed by users choice`);
    return false;
  } else if (savedCommand === undefined) {
    const commandChoice = confirmCommandDialog(displayCommand, mainWindow);
    if (settings?.confirmedCommands === undefined) {
      settings.confirmedCommands = {};
    }
    settings.confirmedCommands[consentKey] = commandChoice;
    saveSettings(SETTINGS_PATH, settings);
    if (!commandChoice) {
      console.error(`Invalid command: ${consentKey}, command not allowed by users choice`);
    }
    return commandChoice;
  }
  return true;
}

function defaultPluginRoots(): PluginRoots {
  return {
    development: defaultPluginsDir(),
    user: defaultUserPluginsDir(),
    shipped:
      typeof process.resourcesPath === 'string'
        ? path.join(process.resourcesPath, '.plugins')
        : path.resolve('.plugins'),
  };
}

function isPathWithin(root: string, candidate: string): boolean {
  const relativePath = path.relative(path.resolve(root), path.resolve(candidate));
  return (
    relativePath === '' ||
    (relativePath !== '..' &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  );
}

/** Removes plugin-controlled directories from the executable search path. */
export function systemCommandEnvironment(
  environment: NodeJS.ProcessEnv,
  pluginRoots: PluginRoots = defaultPluginRoots()
): NodeJS.ProcessEnv {
  const pathKey = Object.keys(environment).find(key => key.toUpperCase() === 'PATH');
  if (!pathKey || !environment[pathKey]) {
    return { ...environment };
  }
  const roots = Object.values(pluginRoots);
  return {
    ...environment,
    [pathKey]: environment[pathKey]
      .split(path.delimiter)
      .filter(
        directory =>
          directory !== '' &&
          path.isAbsolute(directory) &&
          !roots.some(root => isPathWithin(root, directory))
      )
      .join(path.delimiter),
  };
}

/** Resolved plugin executable and the canonical bundle that owns it. */
interface ResolvedPluginExecutable {
  /** Canonical absolute plugin bundle path. */
  bundle: string;
  /** Canonical absolute executable path selected for process creation. */
  executable: string;
}

/**
 * Resolves a declared plugin executable without allowing bundle escapes or symbolic links.
 *
 * @param executablePath - Platform-independent executable path relative to the bundle.
 * @param capability - Verified plugin identity and inventory bound to the command capability.
 * @param pluginRoots - Main-process filesystem root for each plugin inventory.
 * @returns Canonical bundle and executable paths, or `undefined` when resolution is unsafe.
 */
function resolvePluginExecutable(
  executablePath: string,
  capability: RegisteredPluginCommandCapability,
  pluginRoots: PluginRoots
): ResolvedPluginExecutable | undefined {
  const root = pluginRoots[capability.source];
  const bundle = path.resolve(root, capability.bundleName);
  const platformPath = executablePath.split('/').join(path.sep);
  const names =
    process.platform === 'win32' ? [platformPath, `${platformPath}.exe`] : [platformPath];
  try {
    if (fs.lstatSync(bundle).isSymbolicLink()) {
      return undefined;
    }
    const canonicalRoot = fs.realpathSync(root);
    const canonicalBundle = fs.realpathSync(bundle);
    if (!isPathWithin(canonicalRoot, canonicalBundle)) {
      return undefined;
    }
    for (const name of names) {
      try {
        const executable = path.resolve(bundle, name);
        const executableStat = fs.lstatSync(executable);
        if (!executableStat.isFile() || executableStat.isSymbolicLink()) {
          continue;
        }
        const canonicalExecutable = fs.realpathSync(executable);
        if (isPathWithin(canonicalBundle, canonicalExecutable)) {
          return { bundle: canonicalBundle, executable: canonicalExecutable };
        }
      } catch {
        continue;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Reduces a process creation error to a non-sensitive diagnostic reason.
 *
 * @param error - Error thrown or emitted by `spawn`.
 * @returns The operating-system error code, error class name, or `unknown`.
 */
function spawnFailureReason(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') {
      return code;
    }
  }
  return error instanceof Error ? error.name : 'unknown';
}

const COMMANDS_WITH_CONSENT = {
  headlamp_minikube: [
    'minikube start',
    'minikube stop',
    'minikube delete',
    'minikube status',
    'minikube service',
    'minikube logs',
    'minikube addons',
    'minikube ssh',
    'scriptjs headlamp_minikubeprerelease/manage-minikube.js',
    'scriptjs headlamp_minikube/manage-minikube.js',
    'scriptjs minikube/manage-minikube.js',
  ],
  headlamp_ai_assistant: ['gh auth', 'az account', 'az cognitiveservices'],
  azure_aks: ['scriptjs azure-aks/azure-api.js'],
};

const LEGACY_MINIKUBE_COMMANDS = new Set(COMMANDS_WITH_CONSENT.headlamp_minikube);
const LEGACY_AI_ASSISTANT_COMMANDS = new Set(COMMANDS_WITH_CONSENT.headlamp_ai_assistant);
const LEGACY_AZURE_AKS_COMMANDS = new Set(COMMANDS_WITH_CONSENT.azure_aks);
const LEGACY_CONSENT_PLUGIN_COMMANDS = new Map<string, ReadonlySet<string>>([
  ['development\0@headlamp-k8s/minikube\0minikube', LEGACY_MINIKUBE_COMMANDS],
  ['development\0@headlamp-k8s/minikube\0headlamp_minikube', LEGACY_MINIKUBE_COMMANDS],
  [
    'development\0@headlamp-k8s/minikubeprerelease\0headlamp_minikubeprerelease',
    LEGACY_MINIKUBE_COMMANDS,
  ],
  ['development\0@headlamp-k8s/ai-assistant\0ai-assistant', LEGACY_AI_ASSISTANT_COMMANDS],
  ['development\0@headlamp-k8s/ai-assistant\0headlamp_ai-assistant', LEGACY_AI_ASSISTANT_COMMANDS],
  ['development\0@headlamp-k8s/ai-assistant\0headlamp_ai_assistant', LEGACY_AI_ASSISTANT_COMMANDS],
  [
    'development\0@headlamp-k8s/ai-assistantprerelease\0ai-assistantprerelease',
    LEGACY_AI_ASSISTANT_COMMANDS,
  ],
  [
    'development\0@headlamp-k8s/ai-assistantprerelease\0headlamp_ai-assistantprerelease',
    LEGACY_AI_ASSISTANT_COMMANDS,
  ],
  [
    'development\0@headlamp-k8s/ai-assistantprerelease\0headlamp_ai_assistantprerelease',
    LEGACY_AI_ASSISTANT_COMMANDS,
  ],
  ['development\0azure-aks\0azure-aks', LEGACY_AZURE_AKS_COMMANDS],
]);

/**
 * Adds the runCmd consent for the plugin.
 *
 * This is used to give consent to the plugin to run commands when the plugin is installed.
 * So the user is not presented with many consent requests.
 *
 * @param pluginInfo artifacthub plugin info
 */
export function addRunCmdConsent(pluginInfo: { name: string }): void {
  const settings = loadSettings(SETTINGS_PATH);
  if (!settings.confirmedCommands) {
    settings.confirmedCommands = {};
  }
  let commands: string[] = [];
  const pluginIsMinikube =
    pluginInfo.name === 'headlamp_minikube' ||
    pluginInfo.name === 'headlamp_minikubeprerelease' ||
    (process.env.NODE_ENV === 'development' && pluginInfo.name === 'minikube');

  if (pluginIsMinikube) {
    commands = COMMANDS_WITH_CONSENT.headlamp_minikube;
  }

  // Match both hyphen and underscore variants: the ArtifactHub installer may create
  // the folder as 'headlamp_ai-assistant' or 'headlamp_ai_assistant' depending on
  // the version of Headlamp and the plugin manager being used.
  const pluginIsAiAssistant =
    pluginInfo.name === 'headlamp_ai-assistant' ||
    pluginInfo.name === 'headlamp_ai_assistant' ||
    pluginInfo.name === 'headlamp_ai-assistantprerelease' ||
    pluginInfo.name === 'headlamp_ai_assistantprerelease' ||
    (process.env.NODE_ENV === 'development' && pluginInfo.name === 'ai-assistant');
  if (pluginIsAiAssistant) {
    commands = COMMANDS_WITH_CONSENT.headlamp_ai_assistant;
  }

  if (pluginInfo.name === 'azure-aks') {
    commands = COMMANDS_WITH_CONSENT.azure_aks;
  }

  for (const command of commands) {
    if (!settings.confirmedCommands[command]) {
      settings.confirmedCommands[command] = true;
    }
  }

  saveSettings(SETTINGS_PATH, settings);
}

/**
 * Adds the runCmd consent for the plugin.
 *
 * @param pluginName The package.json name of the plugin.
 * @param bundleName The installed bundle folder being removed.
 */
export function removeRunCmdConsent(pluginName: string, bundleName?: string): void {
  const settings = loadSettings(SETTINGS_PATH);
  if (!settings.confirmedCommands) {
    return;
  }
  let commands: string[] = [];
  if (
    pluginName === '@headlamp-k8s/minikubeprerelease' ||
    pluginName === '@headlamp-k8s/minikube'
  ) {
    commands = COMMANDS_WITH_CONSENT.headlamp_minikube;
  }
  if (
    pluginName === '@headlamp-k8s/ai-assistant' ||
    pluginName === '@headlamp-k8s/ai-assistantprerelease'
  ) {
    commands = COMMANDS_WITH_CONSENT.headlamp_ai_assistant;
  }
  for (const command of commands) {
    delete settings.confirmedCommands[command];
  }
  if (bundleName) {
    const prefix = 'run-command-consent:v2:';
    for (const consentKey of Object.keys(settings.confirmedCommands)) {
      if (!consentKey.startsWith(prefix)) {
        continue;
      }
      try {
        const [identity] = JSON.parse(consentKey.slice(prefix.length));
        if (identity?.packageName === pluginName && identity?.bundleName === bundleName) {
          delete settings.confirmedCommands[consentKey];
        }
      } catch {
        // Ignore malformed settings keys retained from external edits.
      }
    }
  }

  saveSettings(SETTINGS_PATH, settings);
}

/**
 * Check if the command has the correct permission secret.
 * If the command is 'scriptjs', it checks for a specific script path.
 *
 * @returns [permissionsValid, permissionError]
 */
export function checkPermissionSecret(
  commandData: CommandData,
  permissionSecrets: Record<string, number>
): [boolean, string] {
  let permissionName = 'runCmd-' + commandData.command;
  if (commandData.command === 'scriptjs') {
    const pluginPathNormalized = commandData.args[0]?.replace(/plugins[\\/]/, 'plugins/');
    permissionName = 'runCmd-' + commandData.command + '-' + pluginPathNormalized;
  }
  if (
    permissionSecrets[permissionName] === undefined ||
    permissionSecrets[permissionName] !== commandData.permissionSecrets[permissionName]
  ) {
    return [false, `No permission secret found for command: ${permissionName}, cannot run command`];
  }
  return [true, ''];
}

/**
 * Creates capabilities for product policies whose reported plugin provenance matches.
 *
 * The renderer supplies discovery results only before plugin code executes. The
 * main process independently requires the configured source, package identity,
 * and expected inventory path before issuing a capability.
 *
 * @param registrations - Untrusted plugin discovery results from the renderer.
 * @param policies - Validated policies loaded from the packaged product manifest.
 * @param webContentsId - Main renderer that will own generated capabilities.
 * @returns Public capabilities and the private token lookup used for enforcement.
 */
export function createProductCommandCapabilities(
  registrations: unknown,
  policies: ProductPluginCommandPolicy[],
  webContentsId: number
): {
  capabilities: PluginCommandCapability[];
  capabilityRegistry: Map<string, RegisteredPluginCommandCapability>;
} {
  const capabilities: PluginCommandCapability[] = [];
  const capabilityRegistry = new Map<string, RegisteredPluginCommandCapability>();
  if (!Array.isArray(registrations) || registrations.length > 256) {
    return { capabilities, capabilityRegistry };
  }

  const registrationsByIdentity = new Map<string, PluginCommandRegistration>();
  const ambiguousIdentities = new Set<string>();
  for (const candidate of registrations) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      continue;
    }
    const registration = candidate as Partial<PluginCommandRegistration>;
    if (
      typeof registration.bundleName !== 'string' ||
      typeof registration.packageName !== 'string' ||
      typeof registration.path !== 'string' ||
      typeof registration.sourceDigest !== 'string' ||
      !/^[a-f0-9]{64}$/.test(registration.sourceDigest) ||
      !['development', 'user', 'shipped'].includes(registration.source ?? '') ||
      !['development', 'user', 'shipped'].includes(registration.type ?? '')
    ) {
      continue;
    }
    const normalizedPath = registration.path.replaceAll('\\', '/');
    const inventoryPath = {
      development: 'plugins',
      user: 'user-plugins',
      shipped: 'static-plugins',
    }[registration.source as ProductPluginCommandPolicy['source']];
    if (normalizedPath !== `${inventoryPath}/${registration.bundleName}`) {
      continue;
    }
    const identity = `${registration.source}\0${registration.bundleName}\0${registration.packageName}`;
    if (registrationsByIdentity.has(identity) || ambiguousIdentities.has(identity)) {
      registrationsByIdentity.delete(identity);
      ambiguousIdentities.add(identity);
      continue;
    }
    registrationsByIdentity.set(identity, registration as PluginCommandRegistration);
  }

  for (const policy of policies) {
    const identity = `${policy.source}\0${policy.bundleName}\0${policy.packageName}`;
    if (!registrationsByIdentity.has(identity)) {
      continue;
    }
    const capability = crypto.randomBytes(32).toString('hex');
    capabilities.push({
      bundleName: policy.bundleName,
      packageName: policy.packageName,
      capability,
    });
    capabilityRegistry.set(capability, { ...policy, webContentsId });
  }

  return { capabilities, capabilityRegistry };
}

/**
 * Returns the path to a script in the plugins directory.
 * @param scriptName script relative to plugins folder. "headlamp-k8s-minikube/bin/manage-minikube.js"
 * @param policy optional policy binding for capability-authorized scripts.
 * @returns The legacy script path, a verified policy-bound path, or undefined for an unsafe path.
 */
function getPluginsScriptPath(
  scriptName: string,
  policy?: ProductPluginCommandPolicy,
  pluginRoots: PluginRoots = defaultPluginRoots()
): string | undefined {
  if (policy) {
    const pluginRoot = pluginRoots[policy.source];
    const bundleRoot = path.resolve(pluginRoot, policy.bundleName);
    const scriptPath = path.resolve(pluginRoot, scriptName);
    const relativeScriptPath = path.relative(bundleRoot, scriptPath);
    if (
      relativeScriptPath === '' ||
      relativeScriptPath === '..' ||
      relativeScriptPath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeScriptPath)
    ) {
      return undefined;
    }
    try {
      const bundleStat = fs.lstatSync(bundleRoot);
      const scriptStat = fs.lstatSync(scriptPath);
      const canonicalPluginRoot = fs.realpathSync(pluginRoot);
      const canonicalBundle = fs.realpathSync(bundleRoot);
      const canonicalScript = fs.realpathSync(scriptPath);
      const relativeCanonicalBundle = path.relative(canonicalPluginRoot, canonicalBundle);
      const relativeCanonicalScript = path.relative(canonicalBundle, canonicalScript);
      if (
        !bundleStat.isDirectory() ||
        bundleStat.isSymbolicLink() ||
        !scriptStat.isFile() ||
        scriptStat.isSymbolicLink() ||
        relativeCanonicalBundle !== policy.bundleName ||
        relativeCanonicalScript === '' ||
        relativeCanonicalScript === '..' ||
        relativeCanonicalScript.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativeCanonicalScript)
      ) {
        return undefined;
      }
      return canonicalScript;
    } catch {
      return undefined;
    }
  }

  const userPlugins = defaultUserPluginsDir();
  if (fs.existsSync(path.join(userPlugins, scriptName))) {
    return path.join(userPlugins, scriptName);
  }

  const devPlugins = defaultPluginsDir();
  if (fs.existsSync(path.join(devPlugins, scriptName))) {
    return path.join(devPlugins, scriptName);
  }

  const shippedPlugins = path.join(process.resourcesPath, '.plugins');
  if (fs.existsSync(path.join(shippedPlugins, scriptName))) {
    return path.join(shippedPlugins, scriptName);
  }

  return path.join(devPlugins, scriptName);
}

/**
 * Handles 'run-command' events from the renderer process.
 *
 * Spawns the requested command and sends 'command-stdout',
 * 'command-stderr', and 'command-exit' events back to the renderer
 * process with the command's output and exit code.
 *
 * @param event - The event object.
 * @param eventData - The data sent from the renderer process.
 * @param mainWindow - The main browser window.
 * @param permissionSecrets - The permission secrets required for the command to run.
 *                            Checks against eventData.permissionSecrets.
 * @param capabilityRegistry - Main-process capability policy bound to the active renderer.
 * @param trustedStartUrl - Headlamp document URL allowed to use capabilities.
 * @param pluginRoots - Main-process filesystem roots for plugin inventories.
 */
export async function handleRunCommand(
  event: IpcMainEvent,
  eventData: CommandDataPartial,
  mainWindow: BrowserWindow | null,
  permissionSecrets: Record<string, number>,
  capabilityRegistry: Map<string, RegisteredPluginCommandCapability> = new Map(),
  trustedStartUrl?: string,
  pluginRoots: PluginRoots = defaultPluginRoots()
): Promise<void> {
  const commandId = typeof eventData?.id === 'string' ? eventData.id : undefined;
  const sendRejectedExit = (exitCode = -1) => {
    if (commandId) {
      event.sender.send('command-exit', commandId, exitCode);
    }
  };

  if (mainWindow === null) {
    console.error('Main window is null, cannot run command');
    sendRejectedExit();
    return;
  }
  const [isValid, errorMessage] = validateCommandData(eventData);
  if (!isValid) {
    console.error(errorMessage);
    sendRejectedExit();
    return;
  }
  const commandData = eventData as CommandData;

  const registeredCapability = commandData.capability
    ? capabilityRegistry.get(commandData.capability)
    : undefined;
  const commandFailureContext = (reason: string) => ({
    tool: commandData.command,
    reason,
    ...(registeredCapability && {
      packageName: registeredCapability.packageName,
      bundleName: registeredCapability.bundleName,
      source: registeredCapability.source,
    }),
  });
  const isFromTrustedMainFrame = () =>
    mainWindow !== null &&
    (!trustedStartUrl ||
      (event.sender === mainWindow.webContents &&
        event.senderFrame === mainWindow.webContents.mainFrame &&
        isTrustedDocumentUrl(event.senderFrame.url, trustedStartUrl)));
  const capabilityGrant = registeredCapability?.grants.find(grant =>
    isRunCommandAllowed([grant], commandData.command, commandData.args)
  );
  const [permissionsValid, permissionError] = commandData.capability
    ? registeredCapability?.webContentsId === event.sender.id &&
      capabilityGrant &&
      isFromTrustedMainFrame()
      ? [true, '']
      : [false, 'Command is not authorized by product policy']
    : checkPermissionSecret(commandData, permissionSecrets);
  if (!permissionsValid) {
    console.error(permissionError);
    sendRejectedExit(-2);
    return;
  }

  if (
    !checkCommandConsent(
      commandData.command,
      commandData.args,
      mainWindow,
      registeredCapability ? registeredCapability : undefined,
      capabilityGrant?.args
    )
  ) {
    sendRejectedExit(-3);
    return;
  }

  let shellEnvironment = process.env;
  try {
    const { getShellEnvironment } = await import('./main');
    shellEnvironment = await getShellEnvironment();
  } catch (error) {
    console.warn('Failed to get shell environment, using process.env:', error);
  }

  // Get the command and args to run. With the correct paths for "scriptjs" commands.
  // scriptjs commands are scripts run with the compiled app, or with "Electron" in dev mode.
  const scriptPath =
    commandData.command === 'scriptjs'
      ? getPluginsScriptPath(commandData.args[0], registeredCapability, pluginRoots)
      : undefined;
  if (commandData.command === 'scriptjs' && !scriptPath) {
    console.error('Command script is outside its authorized plugin bundle');
    sendRejectedExit(-2);
    return;
  }
  let preparedPluginScript: string | undefined;
  if (commandData.command === 'scriptjs' && registeredCapability?.artifactHub) {
    let prepared;
    try {
      const pluginRoot = pluginRoots[registeredCapability.source];
      const bundlePath = fs.realpathSync(path.resolve(pluginRoot, registeredCapability.bundleName));
      const relativeScript = path.relative(bundlePath, scriptPath as string);
      prepared = await preparePluginScript(
        bundlePath,
        relativeScript,
        registeredCapability.artifactHub
      );
    } catch (error) {
      prepared = { ok: false as const, reason: spawnFailureReason(error) };
    }
    if (!prepared.ok) {
      console.error('Plugin script unavailable', commandFailureContext(prepared.reason));
      event.sender.send(
        'command-stderr',
        commandData.id,
        'Plugin installation provenance is missing or invalid. Reinstall the plugin.'
      );
      sendRejectedExit(-2);
      return;
    }
    preparedPluginScript = prepared.scriptPath;
  }
  const pluginExecutable =
    registeredCapability &&
    commandData.command !== 'scriptjs' &&
    capabilityGrant?.executable?.source === 'plugin'
      ? resolvePluginExecutable(capabilityGrant.executable.path, registeredCapability, pluginRoots)
      : undefined;
  let preparedPluginExecutable: string | undefined;
  const removePreparedExecutable = () => {
    if (!preparedPluginExecutable) {
      return;
    }
    try {
      removePreparedPluginExecutable(preparedPluginExecutable);
    } catch (error) {
      console.warn('Failed to remove prepared plugin executable', spawnFailureReason(error));
    } finally {
      preparedPluginExecutable = undefined;
    }
  };
  const removePreparedScript = () => {
    if (!preparedPluginScript) {
      return;
    }
    try {
      removePreparedPluginScript(preparedPluginScript);
    } catch (error) {
      console.warn('Failed to remove prepared plugin script', spawnFailureReason(error));
    } finally {
      preparedPluginScript = undefined;
    }
  };
  const removePreparedFiles = () => {
    removePreparedExecutable();
    removePreparedScript();
  };
  if (capabilityGrant?.executable?.source === 'plugin') {
    const developmentExecutable = registeredCapability?.source === 'development';
    let failureReason: string | undefined;
    if (!pluginExecutable) {
      failureReason = 'missing-or-unsafe-executable';
    } else if (!developmentExecutable) {
      const prepared = await preparePluginExecutable(
        pluginExecutable.bundle,
        capabilityGrant.executable.path,
        pluginExecutable.executable
      );
      if (prepared.ok) {
        preparedPluginExecutable = prepared.executablePath;
      } else {
        failureReason = prepared.reason;
      }
    }
    if (failureReason) {
      console.error('Plugin executable unavailable', commandFailureContext(failureReason));
      if (failureReason === 'missing-receipt') {
        event.sender.send(
          'command-stderr',
          commandData.id,
          'Plugin executable integrity metadata is missing. Update or reinstall the plugin.'
        );
      }
      sendRejectedExit(-2);
      return;
    }
  }
  if (
    commandData.capability &&
    (capabilityRegistry.get(commandData.capability) !== registeredCapability ||
      registeredCapability?.webContentsId !== event.sender.id ||
      !isFromTrustedMainFrame())
  ) {
    removePreparedFiles();
    console.error('Command capability was revoked before process creation');
    sendRejectedExit(-2);
    return;
  }
  const command =
    commandData.command === 'scriptjs'
      ? process.execPath
      : preparedPluginExecutable ?? pluginExecutable?.executable ?? commandData.command;
  const args =
    commandData.command === 'scriptjs'
      ? [preparedPluginScript ?? (scriptPath as string), ...commandData.args.slice(1)]
      : commandData.args;

  // If the command is 'scriptjs', we pass the HEADLAMP_RUN_SCRIPT=true
  // env var so that the Headlamp or Electron process runs the script.
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn(command, args, {
      ...commandData.options,
      shell: false,
      env: {
        ...(registeredCapability && commandData.command !== 'scriptjs'
          ? systemCommandEnvironment(shellEnvironment, pluginRoots)
          : shellEnvironment),
        ...(commandData.command === 'scriptjs' ? { HEADLAMP_RUN_SCRIPT: 'true' } : {}),
      },
    });
  } catch (error) {
    removePreparedFiles();
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to spawn command', commandFailureContext(spawnFailureReason(error)));
    event.sender.send('command-stderr', commandData.id, message);
    event.sender.send('command-exit', commandData.id, -1);
    return;
  }

  child.stdout.on('data', (data: string | Buffer) => {
    event.sender.send('command-stdout', commandData.id, data.toString());
  });

  child.stderr.on('data', (data: string | Buffer) => {
    event.sender.send('command-stderr', commandData.id, data.toString());
  });

  let terminalEventSent = false;
  const sendTerminalEvent = (code: number | null) => {
    if (terminalEventSent) {
      return;
    }
    terminalEventSent = true;
    event.sender.send('command-exit', commandData.id, code);
  };

  child.on('error', (err: Error) => {
    removePreparedFiles();
    console.error('Command process error', commandFailureContext(spawnFailureReason(err)));
    event.sender.send('command-stderr', commandData.id, err.message);
    sendTerminalEvent(-1);
  });

  child.on('close', (code: number | null) => {
    removePreparedFiles();
    sendTerminalEvent(code);
  });
}

/**
 * Runs a script, using the compiled app, or Electron in dev mode.
 *
 * This is needed to run the "scriptjs" commands, as a way of running
 * node js scripts without requiring node to also be installed.
 */
export function runScript() {
  const baseDir = path.resolve(defaultPluginsDir());
  const userPluginsDir = path.resolve(defaultUserPluginsDir());
  const staticPluginsDir = path.resolve(path.join(process.resourcesPath, '.plugins'));
  const preparedScriptsDir = path.resolve(PREPARED_PLUGIN_SCRIPTS_PATH);
  const scriptPath = path.resolve(process.argv[1]);

  const isWithin = (root: string) => {
    const relative = path.relative(root, scriptPath);
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  };

  if (
    !isWithin(baseDir) &&
    !isWithin(userPluginsDir) &&
    !isWithin(staticPluginsDir) &&
    !isWithin(preparedScriptsDir)
  ) {
    console.error(
      `Invalid script path: ${scriptPath}. Must be within an authorized plugin script directory.`
    );
    process.exit(1);
  }

  import(pathToFileURL(scriptPath).href);
}

/**
 * @returns a random number between 0 and 1, like Math.random(),
 * but using the web crypto API for better randomness.
 */
function cryptoRandom() {
  const array = new Uint32Array(1);
  crypto.webcrypto.getRandomValues(array);
  return array[0] / (0xffffffff + 1);
}

/**
 * Sets up the IPC handlers for running commands.
 * Called in the main process to handle 'run-command' events.
 *
 * @param mainWindow - The main browser window.
 * @param ipcMain - The IPC main instance.
 * @param productPolicies - Validated product command policies available for registration.
 * @param trustedStartUrl - Headlamp document URL allowed to register and use capabilities.
 * @param pluginRoots - Optional inventory roots used to verify plugin files during registration.
 * @param isDevelopment - Runtime mode selected by the Electron entry point.
 */
export function setupRunCmdHandlers(
  mainWindow: BrowserWindow | null,
  ipcMain: Electron.IpcMain,
  productPolicies: ProductPluginCommandPolicy[] = [],
  trustedStartUrl?: string,
  pluginRoots?: Record<ProductPluginCommandPolicy['source'], string>,
  isDevelopment = false,
  developmentPluginsEnabled: () => boolean = () => false
) {
  if (mainWindow === null) {
    console.error('Main window is null, cannot set up run command handlers');
    return;
  }

  // We only send the plugin permission secrets once. So any code can't just request them again.
  // This means that if the secrets are requested before the plugins are loaded, then
  // they will not be sent until the next time the app is reloaded.
  let pluginPermissionSecretsSent = false;
  const previousListeners = runCmdIpcListeners.get(ipcMain);
  if (previousListeners) {
    ipcMain.off('request-plugin-permission-secrets', previousListeners.requestPermissionSecrets);
    ipcMain.off('run-command', previousListeners.runCommand);
  }
  ipcMain.removeHandler('register-plugin-command-capabilities');

  let capabilityRegistrationAllowed = trustedStartUrl === undefined;
  let capabilityRegistry = new Map<string, RegisteredPluginCommandCapability>();
  const revokeCapabilities = () => {
    capabilityRegistrationAllowed = false;
    capabilityRegistry.clear();
  };
  const permissionSecrets = {
    'runCmd-minikube': cryptoRandom(),
    'runCmd-scriptjs-minikube/manage-minikube.js': cryptoRandom(),
    'runCmd-scriptjs-headlamp_minikube/manage-minikube.js': cryptoRandom(),
    'runCmd-scriptjs-headlamp_minikubeprerelease/manage-minikube.js': cryptoRandom(),
    'runCmd-gh': cryptoRandom(),
    'runCmd-az': cryptoRandom(),
    'runCmd-scriptjs-azure-aks/azure-api.js': cryptoRandom(),
  };

  const requestPermissionSecrets = () => {
    if (!pluginPermissionSecretsSent) {
      pluginPermissionSecretsSent = true;
      mainWindow?.webContents.send('plugin-permission-secrets', permissionSecrets);
    }
  };
  ipcMain.on('request-plugin-permission-secrets', requestPermissionSecrets);

  ipcMain.handle('register-plugin-command-capabilities', async (event, registrations: unknown) => {
    if (
      event.sender !== mainWindow.webContents ||
      (trustedStartUrl !== undefined &&
        (event.senderFrame !== mainWindow.webContents.mainFrame ||
          !isTrustedDocumentUrl(event.senderFrame.url, trustedStartUrl))) ||
      !capabilityRegistrationAllowed
    ) {
      return [];
    }
    capabilityRegistrationAllowed = false;
    const enabledPolicies = productPolicies.filter(
      policy =>
        policy.source !== 'development' || isDevelopment || developmentPluginsEnabled() === true
    );
    const result = createProductCommandCapabilities(
      registrations,
      await verifyPluginCommandPolicies(enabledPolicies, registrations, pluginRoots),
      mainWindow.webContents.id
    );
    capabilityRegistry = result.capabilityRegistry;
    return result.capabilities;
  });

  mainWindow.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) {
      revokeCapabilities();
    }
  });
  mainWindow.webContents.on(
    'did-frame-navigate',
    (_event, url, _httpResponseCode, _httpStatusText, isMainFrame) => {
      if (isMainFrame) {
        pluginPermissionSecretsSent = false;
        capabilityRegistrationAllowed =
          trustedStartUrl === undefined || isTrustedDocumentUrl(url, trustedStartUrl);
        capabilityRegistry.clear();
      }
    }
  );

  mainWindow.on('closed', () => {
    revokeCapabilities();
  });

  const runCommand = (event: IpcMainEvent, eventData: CommandDataPartial) =>
    handleRunCommand(
      event,
      eventData,
      mainWindow,
      permissionSecrets,
      capabilityRegistry,
      trustedStartUrl,
      pluginRoots ?? defaultPluginRoots()
    );
  ipcMain.on('run-command', runCommand);
  runCmdIpcListeners.set(ipcMain, { requestPermissionSecrets, revokeCapabilities, runCommand });
}

/** Revokes every command capability issued by handlers registered on this IPC instance. */
export function revokeRunCmdCapabilities(ipcMain: Electron.IpcMain): void {
  runCmdIpcListeners.get(ipcMain)?.revokeCapabilities();
}

/**
 * Like CommandData, but everything is optional because it's not validated yet.
 */
type CommandDataPartial = Partial<CommandData>;

/**
 * Checks to see if it's what we expect.
 */
export function validateCommandData(eventData: CommandDataPartial): [boolean, string] {
  if (!eventData || typeof eventData !== 'object' || eventData === null) {
    return [false, `Invalid eventData data received: ${eventData}`];
  }
  if (typeof eventData.id !== 'string' || !eventData.id) {
    return [false, `Invalid eventData.id: ${eventData.id}`];
  }
  if (typeof eventData.command !== 'string' || !eventData.command) {
    return [false, `Invalid eventData.command: ${eventData.command}`];
  }
  if (!Array.isArray(eventData.args)) {
    return [false, `Invalid eventData.args: ${eventData.args}`];
  }
  if (typeof eventData.options !== 'object' || eventData.options === null) {
    return [false, `Invalid eventData.options: ${eventData.options}`];
  }
  if (typeof eventData.permissionSecrets !== 'object' || eventData.permissionSecrets === null) {
    return [
      false,
      `Invalid permission secrets, it is not an object: ${typeof eventData.permissionSecrets}`,
    ];
  }
  for (const [key, value] of Object.entries(eventData.permissionSecrets)) {
    if (typeof value !== 'number') {
      return [false, `Invalid permission secret for ${key}: ${typeof value}`];
    }
  }

  if (eventData.args.some(argument => typeof argument !== 'string')) {
    return [false, 'Invalid eventData.args: arguments must be strings'];
  }
  if (
    eventData.capability !== undefined &&
    (typeof eventData.capability !== 'string' || !/^[a-f0-9]{64}$/.test(eventData.capability))
  ) {
    return [false, 'Invalid command capability'];
  }
  if (
    eventData.capability !== undefined &&
    (Object.getPrototypeOf(eventData.options) !== Object.prototype ||
      Reflect.ownKeys(eventData.options).length !== 0)
  ) {
    return [false, 'Command capabilities do not allow spawn options'];
  }

  const validCommands = ['minikube', 'az', 'scriptjs', 'gh'];

  if (eventData.capability === undefined && !validCommands.includes(eventData.command)) {
    return [
      false,
      `Invalid command: ${eventData.command}, only valid commands are: ${JSON.stringify(
        validCommands
      )}`,
    ];
  }

  return [true, ''];
}

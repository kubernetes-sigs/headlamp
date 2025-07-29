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
import { app, BrowserWindow, dialog } from 'electron';
import { IpcMainEvent } from 'electron/main';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'path';
import i18n from './i18next.config';
import { defaultPluginsDir } from './plugin-management';

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

const SETTINGS_PATH = path.join(app?.getPath('userData') || 'testing', 'settings.json');

/**
 * Loads the user settings.
 * If the settings file does not exist, an empty object is returned.
 * @returns The settings object.
 */
function loadSettings(): Record<string, any> {
  try {
    const data = fs.readFileSync(SETTINGS_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

/**
 * Saves the user settings.
 * @param settings - The settings object to save.
 */
function saveSettings(settings: Record<string, any>) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings), 'utf-8');
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
function checkCommandConsent(command: string, args: string[], mainWindow: BrowserWindow): boolean {
  const settings = loadSettings();
  const confirmedCommands = settings?.confirmedCommands;

  // Build the consent key: command + (first arg if present)
  let consentKey = command;
  if (args && args.length > 0) {
    consentKey += ' ' + args[0];
  }

  const savedCommand: boolean | undefined = confirmedCommands
    ? confirmedCommands[consentKey]
    : undefined;

  if (savedCommand === false) {
    console.error(`Invalid command: ${consentKey}, command not allowed by users choice`);
    return false;
  } else if (savedCommand === undefined) {
    const commandChoice = confirmCommandDialog(consentKey, mainWindow);
    if (settings?.confirmedCommands === undefined) {
      settings.confirmedCommands = {};
    }
    settings.confirmedCommands[consentKey] = commandChoice;
    saveSettings(settings);
  }
  return true;
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
};
/**
 * Adds the runCmd consent for the plugin.
 *
 * This is used to give consent to the plugin to run commands when the plugin is installed.
 * So the user is not presented with many consent requests.
 *
 * @param pluginInfo artifacthub plugin info
 */
export function addRunCmdConsent(pluginInfo: { name: string }): void {
  const settings = loadSettings();
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
  for (const command of commands) {
    if (!settings.confirmedCommands[command]) {
      settings.confirmedCommands[command] = true;
    }
  }

  saveSettings(settings);
}

/**
 * Adds the runCmd consent for the plugin.
 *
 * @param pluginName The package.json name of the plugin.
 */
export function removeRunCmdConsent(pluginName: string): void {
  const settings = loadSettings();
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
  for (const command of commands) {
    delete settings.confirmedCommands[command];
  }

  saveSettings(settings);
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
    permissionName = 'runCmd-' + commandData.command + '-' + commandData.args[0];
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
 * Returns the path to a script in the plugins directory.
 * @param scriptName script relative to plugins folder. "headlamp-k8s-minikube/bin/manage-minikube.js"
 */
function getPluginsScriptPath(scriptName: string) {
  const userPlugins = defaultPluginsDir();
  return path.join(userPlugins, scriptName);
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
 */
export function handleRunCommand(
  event: IpcMainEvent,
  eventData: CommandDataPartial,
  mainWindow: BrowserWindow | null,
  permissionSecrets: Record<string, number>
): void {
  if (mainWindow === null) {
    console.error('Main window is null, cannot run command');
    return;
  }
  const [isValid, errorMessage] = validateCommandData(eventData);
  if (!isValid) {
    console.error(errorMessage);
    return;
  }
  const commandData = eventData as CommandData;

  const [permissionsValid, permissionError] = checkPermissionSecret(commandData, permissionSecrets);
  if (!permissionsValid) {
    console.error(permissionError);
    return;
  }

  if (!checkCommandConsent(commandData.command, commandData.args, mainWindow)) {
    return;
  }

  // Get the command and args to run. With the correct paths for "scriptjs" commands.
  // scriptjs commands are scripts run with the compiled app, or with "Electron" in dev mode.
  const command = commandData.command === 'scriptjs' ? process.execPath : commandData.command;
  const args =
    commandData.command === 'scriptjs'
      ? [getPluginsScriptPath(commandData.args[0]), ...commandData.args.slice(1)]
      : commandData.args;

  // If the command is 'scriptjs', we pass the HEADLAMP_RUN_SCRIPT=true
  // env var so that the Headlamp or Electron process runs the script.
  const child: ChildProcessWithoutNullStreams = spawn(command, args, {
    ...commandData.options,
    shell: false,
    env: {
      ...process.env,
      ...(commandData.command === 'scriptjs' ? { HEADLAMP_RUN_SCRIPT: 'true' } : {}),
    },
  });

  child.stdout.on('data', (data: string | Buffer) => {
    event.sender.send('command-stdout', commandData.id, data.toString());
  });

  child.stderr.on('data', (data: string | Buffer) => {
    event.sender.send('command-stderr', commandData.id, data.toString());
  });

  child.on('exit', (code: number | null) => {
    event.sender.send('command-exit', commandData.id, code);
  });
}

/**
 * Runs a script, using the compiled app, or Electron in dev mode.
 *
 * This is needed to run the "scriptjs" commands, as a way of running
 * node js scripts without requiring node to also be installed.
 */
export function runScript() {
  // If '..' in process.argv[1] or it starts with / or \, then it is not a valid path.
  if (
    !process.argv[1] ||
    process.argv[1].includes('..') ||
    process.argv[1].startsWith('/') ||
    process.argv[1].startsWith('\\')
  ) {
    console.error(
      `Invalid script path: ${process.argv[1]}. Must be a relative path within the plugins directory.`
    );
    return;
  }

  const baseDir = path.resolve(defaultPluginsDir());
  const scriptPath = path.resolve(process.argv[1]);
  if (!scriptPath.startsWith(baseDir)) {
    console.error(`Invalid script path: ${scriptPath}. Must be within ${baseDir}.`);
    return;
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
 */
export function setupRunCmdHandlers(mainWindow: BrowserWindow | null, ipcMain: Electron.IpcMain) {
  if (mainWindow === null) {
    console.error('Main window is null, cannot set up run command handlers');
    return;
  }

  // We only send the plugin permission secrets once. So any code can't just request them again.
  // This means that if the secrets are requested before the plugins are loaded, then
  // they will not be sent until the next time the app is reloaded.
  let pluginPermissionSecretsSent = false;
  const permissionSecrets = {
    'runCmd-minikube': cryptoRandom(),
    'runCmd-scriptjs-minikube/manage-minikube.js': cryptoRandom(),
    'runCmd-scriptjs-headlamp_minikube/manage-minikube.js': cryptoRandom(),
    'runCmd-scriptjs-headlamp_minikubeprerelease/manage-minikube.js': cryptoRandom(),
  };

  ipcMain.on('request-plugin-permission-secrets', function giveSecrets() {
    if (!pluginPermissionSecretsSent) {
      pluginPermissionSecretsSent = true;
      mainWindow?.webContents.send('plugin-permission-secrets', permissionSecrets);
    }
  });

  // Only allow sending secrets again when the Electron main window reloads (not just URL changes).
  mainWindow?.webContents.on('did-frame-finish-load', (event, isMainFrame) => {
    if (isMainFrame) {
      pluginPermissionSecretsSent = false;
    }
  });

  ipcMain.on('run-command', (event, eventData) =>
    handleRunCommand(event, eventData, mainWindow, permissionSecrets)
  );
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

  const validCommands = ['minikube', 'az', 'scriptjs'];

  if (!validCommands.includes(eventData.command)) {
    return [
      false,
      `Invalid command: ${eventData.command}, only valid commands are: ${JSON.stringify(
        validCommands
      )}`,
    ];
  }

  return [true, ''];
}

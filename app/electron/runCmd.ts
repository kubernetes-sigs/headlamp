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
import fs from 'node:fs';
import path from 'path';
import { pathToFileURL } from 'url';
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
function loadSettings() {
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
function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings), 'utf-8');
}

/**
 * Checks if the user has already consented to running the command.
 *
 * If the user has not consented, a dialog is shown to ask for consent.
 *
 * @param command - The command to check.
 * @returns true if the user has consented to running the command, false otherwise.
 */
function checkCommandConsent(command: string, mainWindow: BrowserWindow): boolean {
  const settings = loadSettings();
  const confirmedCommands = settings?.confirmedCommands;
  const savedCommand: boolean | undefined = confirmedCommands
    ? confirmedCommands[command]
    : undefined;

  if (savedCommand === false) {
    console.error(`Invalid command: ${command}, command not allowed by users choice`);
    return false;
  } else if (savedCommand === undefined) {
    const commandChoice = confirmCommandDialog(command, mainWindow);
    if (settings?.confirmedCommands === undefined) {
      settings.confirmedCommands = {};
    }
    settings.confirmedCommands[command] = commandChoice;
    saveSettings(settings);
  }
  return true;
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
  console.log({ permissionSecrets, commandData, permissionName });
  if (
    permissionSecrets[permissionName] === undefined ||
    permissionSecrets[permissionName] !== commandData.permissionSecrets[permissionName]
  ) {
    return [false, `No permission secret found for command: ${permissionName}, cannot run command`];
  }
  return [true, ''];
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

  if (!checkCommandConsent(commandData.command || '', mainWindow)) {
    return;
  }

  const [permissionsValid, permissionError] = checkPermissionSecret(commandData, permissionSecrets);
  if (!permissionsValid) {
    console.error(permissionError);
    return;
  }

  const command = commandData.command === 'scriptjs' ? process.execPath : commandData.command;

  const args =
    commandData.command === 'scriptjs'
      ? [getPluginsScriptPath(commandData.args[0]), ...commandData.args.slice(1)]
      : commandData.args;

  console.log({ command, args });

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
 * Sets up the IPC handlers for running commands.
 * This function is called in the main process to handle 'run-command' events.
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
    'runCmd-minikube': Math.random(),
    // 'runCmd-scriptjs-headlamp-pod-counter/bin/manage-minikube.js': Math.random(),
    'runCmd-scriptjs-headlamp-k8s-minikube/bin/manage-minikube.js': Math.random(),
  };

  ipcMain.on('request-plugin-permission-secrets', () => {
    if (!pluginPermissionSecretsSent) {
      pluginPermissionSecretsSent = true;
      mainWindow?.webContents.send('plugin-permission-secrets', permissionSecrets);
    }
  });

  // If the app reloads the browser then we allow the permission secrets to be sent again.
  mainWindow?.webContents.on('did-navigate', () => {
    pluginPermissionSecretsSent = false;
  });

  ipcMain.on('run-command', (event, eventData) =>
    handleRunCommand(event, eventData, mainWindow, permissionSecrets)
  );
}

/**
 * Runs a script, using the compiled app, or Electron in dev mode.
 *
 * This is needed to run the "scriptjs" commands, as a way of running
 * node js scripts without requiring node to also be installed.
 */
export function runScript() {
  import(pathToFileURL(process.argv[1]).href);
}

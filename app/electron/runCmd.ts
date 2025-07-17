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
 * Handles 'run-command' events from the renderer process.
 *
 * Spawns the requested command and sends 'command-stdout',
 * 'command-stderr', and 'command-exit' events back to the renderer
 * process with the command's output and exit code.
 *
 * @param event - The event object.
 * @param eventData - The data sent from the renderer process.
 */
export function handleRunCommand(
  event: IpcMainEvent,
  eventData: CommandData,
  mainWindow: BrowserWindow | null
): void {
  if (mainWindow === null) {
    console.error('Main window is null, cannot show dialog');
    return;
  }

  // Only allow "minikube", and "az" commands
  const validCommands = ['minikube', 'az'];

  if (!validCommands.includes(eventData.command)) {
    console.error(
      `Invalid command: ${eventData.command}, only valid commands are: ${JSON.stringify(
        validCommands
      )}`
    );
    return;
  }
  if (!checkCommandConsent(eventData.command, mainWindow)) {
    return;
  }

  const child: ChildProcessWithoutNullStreams = spawn(eventData.command, eventData.args, {
    ...eventData.options,
    shell: false,
  });

  child.stdout.on('data', (data: string | Buffer) => {
    event.sender.send('command-stdout', eventData.id, data.toString());
  });

  child.stderr.on('data', (data: string | Buffer) => {
    event.sender.send('command-stderr', eventData.id, data.toString());
  });

  child.on('exit', (code: number | null) => {
    event.sender.send('command-exit', eventData.id, code);
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

import { ChildProcessWithoutNullStreams,spawn } from 'child_process';
import { app, BrowserWindow, dialog } from 'electron';
import { IpcMainEvent } from 'electron/main';
import fs from 'node:fs';
import { platform } from 'os';
import path from 'path';
import i18n from './i18next.config';

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
  /**
   * Whether the command needs elevated privileges (sudo/admin).
   */
  elevated?: boolean;
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

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

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
 * Runs a command with elevated privileges using platform-specific methods.
 *
 * @param event - The IPC event used to communicate back with the renderer.
 * @param eventData - The command data including ID, command, and arguments.
 * @returns A promise that resolves when the command completes.
 */
function runElevatedCommand(event: IpcMainEvent, eventData: CommandData): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const cmd = eventData.command;
    const args = eventData.args;
    const cmdString = `${cmd} ${args.join(' ')}`;
    let elevatedProcess: ChildProcessWithoutNullStreams | undefined;
    const currentPlatform = platform();

    try {
      if (currentPlatform === 'win32') {
        // On Windows, use PowerShell's Start-Process with -Verb RunAs to elevate
        elevatedProcess = spawn(
          'powershell.exe',
          [
            '-NoProfile',
            '-Command',
            `Start-Process -FilePath "${cmd}" -ArgumentList '${args.join(
              ' '
            )}' -Verb RunAs -Wait -WindowStyle Hidden`,
          ],
          { windowsHide: true }
        );
      } else if (currentPlatform === 'darwin') {
        // On macOS, use osascript to show a GUI prompt for sudo
        const escapedCmd = cmdString.replace(/"/g, '\\"');
        elevatedProcess = spawn('osascript', [
          '-e',
          `do shell script "${escapedCmd}" with administrator privileges`,
        ]);
      } else {
        // On Linux, use pkexec, gksudo, or sudo depending on what's available
        const graphicalSudoCommands = [
          { cmd: 'pkexec', args: [cmdString] },
          { cmd: 'gksudo', args: ['--description', 'Headlamp', '--', cmdString] },
          {
            cmd: 'kdesudo',
            args: ['--comment', 'Headlamp needs elevated privileges', '--', cmdString],
          },
          { cmd: 'sudo', args: ['-E', cmd, ...args] },
        ];

        // Find the first available sudo command
        let foundSudo = false;
        for (const sudoCommand of graphicalSudoCommands) {
          try {
            // Check if the command exists by trying to spawn it with --version
            const checkResult = spawn(sudoCommand.cmd, ['--version']);
            checkResult.on('error', (e) => {
              // Command doesn't exist, will try the next one
              console.log(`Command ${sudoCommand.cmd}: ${e}`);
            });

            checkResult.on('exit', code => {
              if (code === 0 && !foundSudo) {
                foundSudo = true;
                console.log(`CommandFOUND ${sudoCommand.cmd}: ${foundSudo}`);
                elevatedProcess = spawn(sudoCommand.cmd, sudoCommand.args);
                setupProcessEvents(elevatedProcess);
              }
            });

            // Don't wait for the check to complete, we'll try all commands and use the first one that works
          } catch (error) {
            // Just try the next command if this one doesn't exist
            continue;
          }
        }

        if (!foundSudo) {
          // If no sudo command was found, fall back to basic sudo
          // This will likely fail in a GUI app, but it's our last resort
          elevatedProcess = spawn('sudo', [cmd, ...args]);
          setupProcessEvents(elevatedProcess);
        }
      }

      function setupProcessEvents(process: ChildProcessWithoutNullStreams) {
        process.stdout.on('data', (data: Buffer) => {
          event.sender.send('command-stdout', eventData.id, data.toString());
        });

        process.stderr.on('data', (data: Buffer) => {
          event.sender.send('command-stderr', eventData.id, data.toString());
        });

        process.on('exit', (code: number | null) => {
          event.sender.send('command-exit', eventData.id, code);
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Process exited with code ${code}`));
          }
        });

        process.on('error', error => {
          console.error(`Failed to start elevated process: ${error.message}`);
          event.sender.send(
            'command-stderr',
            eventData.id,
            `Failed to start elevated process: ${error.message}`
          );
          event.sender.send('command-exit', eventData.id, 1);
          reject(error);
        });
      }

      if (!!elevatedProcess && currentPlatform !== 'linux') {
        // For Windows and macOS, set up the process events
        setupProcessEvents(elevatedProcess);
      }
    } catch (error) {
      console.error(`Error executing elevated command: ${error.message}`);
      event.sender.send(
        'command-stderr',
        eventData.id,
        `Error executing elevated command: ${error.message}`
      );
      event.sender.send('command-exit', eventData.id, 1);
      reject(error);
    }
  });
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
console.log('>>>>>>>>>>>>>>>>>>>>', eventData.command, eventData.args, eventData.options);
  // Handle elevated command requests with a dedicated confirmation dialog
  if (eventData.elevated) {
    const resp = dialog.showMessageBoxSync(mainWindow, {
      title: i18n.t('Elevated Privileges Required'),
      message: i18n.t('This command requires administrator privileges to run.'),
      detail: `${eventData.command} ${eventData.args.join(' ')}`,
      type: 'question',
      buttons: [i18n.t('Run with privileges'), i18n.t('Cancel')],
    });

    if (resp === 0) {
      runElevatedCommand(event, eventData).catch(err =>
        console.error('Error in elevated command execution:', err)
      );
      return;
    } else {
      // User cancelled the elevation request
      event.sender.send('command-stderr', eventData.id, 'Elevation request cancelled by user');
      event.sender.send('command-exit', eventData.id, 1);
      return;
    }
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

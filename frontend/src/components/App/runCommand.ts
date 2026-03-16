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

/**
 * Runs a shell command and returns an object that mimics the interface of a ChildProcess object returned by Node's spawn function.
 *
 * This function is intended to be used only when Headlamp is in app mode.
 *
 * @see handleRunCommand in app/electron/main.ts
 *
 * This function uses the desktopApi.send and desktopApi.receive methods to communicate with the main process.
 * @param command - The command to run.
 * @param args - An array of arguments to pass to the command.
 * @param options - Additional options for the command.
 * @param permissionSecrets - Internal use. A record of permission secrets that may be required for the command.
 * @param desktopApiSend - Internal use. The function to send data to the main process.
 * @param desktopApiReceive - Internal use. The function to receive data from the main process.
 * @returns An object with `stdout`, `stderr`, and `on` properties. You can listen for 'data' events on `stdout` and `stderr`, and 'exit' events with `on`.
 * @example
 *
 * How it can be used in a plugin:
 * ```ts
 *   declare const pluginRunCommand: typeof runCommand;
 *   const minikube = pluginRunCommand('minikube', ['status'], {});
 *
 *   minikube.stdout.on('data', (data) => {
 *     console.log('stdout:', data);
 *   });
 *   minikube.stderr.on('data', (data) => {
 *     console.log('stderr:', data);
 *   });
 *   minikube.on('exit', (code) => {
 *     console.log('exit code:', code);
 *   });
 * ```
 */
export function runCommand(
  command: 'minikube' | 'az' | 'scriptjs',
  args: string[],
  options: {},
  permissionSecrets?: Record<string, number>,
  desktopApiSend?: (
    channel: string,
    data: {
      id: string;
      command: string;
      args: string[];
      options: {};
      permissionSecrets: Record<string, number>;
    }
  ) => void,
  desktopApiReceive?: (
    channel: string,
    listener: (cmdId: string, data: string | number) => void
  ) => void
): {
  stdout: { on: (event: string, listener: (chunk: any) => void) => void };
  stderr: { on: (event: string, listener: (chunk: any) => void) => void };
  on: (event: string, listener: (code: number | null) => void) => void;
} {
  if (!window.desktopApi) {
    throw new Error('runCommand only works in Headlamp app mode.');
  }
  if (!desktopApiSend || !desktopApiReceive || !permissionSecrets) {
    // these are only optional for the pluginRunCommand
    throw new Error(
      'Do not use runCommand directly. Use pluginRunCommand via:' +
        '  `declare const pluginRunCommand: typeof runCommand;`'
    );
  }

  // Generate a unique ID for the command, so that we can distinguish between
  // multiple commands running at the same time.
  const id = `${new Date().getTime()}-${Math.random().toString(36)}`;

  const stdout = new EventTarget();
  desktopApiReceive('command-stdout', (cmdId: string, data: string | number) => {
    if (cmdId === id) {
      const event = new CustomEvent('data', { detail: data });
      stdout.dispatchEvent(event);
    }
  });

  const stderr = new EventTarget();
  desktopApiReceive('command-stderr', (cmdId: string, data: string | number) => {
    if (cmdId === id) {
      const event = new CustomEvent('data', { detail: data });
      stderr.dispatchEvent(event);
    }
  });

  const exit = new EventTarget();
  desktopApiReceive('command-exit', (cmdId: string, code: string | number) => {
    if (cmdId === id) {
      const event = new CustomEvent('exit', { detail: code });
      exit.dispatchEvent(event);
    }
  });

  // We use desktopApiReceive and desktopApiSend to communicate with the main process.
  // Because other plugins may change the global window.desktopApi functions
  // to snoop on the secrets that plugins are sending.
  desktopApiSend('run-command', { id, command, args, options, permissionSecrets });

  return {
    stdout: {
      on: (event: string, listener: (chunk: any) => void) =>
        stdout.addEventListener(event, (e: any) => listener(e.detail)),
    },
    stderr: {
      on: (event: string, listener: (chunk: any) => void) =>
        stderr.addEventListener(event, (e: any) => listener(e.detail)),
    },
    on: (event: string, listener: (code: number | null) => void) =>
      exit.addEventListener(event, (e: any) => listener(e.detail)),
  };
}

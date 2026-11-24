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

import { execFile } from 'node:child_process';
import * as fsPromises from 'node:fs/promises';
import { userInfo } from 'node:os';
import { promisify } from 'node:util';

const execFilePromisify = promisify(execFile);

/** Dependencies used to locate an available login shell. */
export interface ShellLookupDependencies {
  /** Returns the user's configured shell, or an empty string when unavailable. */
  getUserShell: () => string;
  /** Resolves when the supplied shell path exists. */
  shellExists: (shell: string) => Promise<unknown>;
}

/** Executes a command through the selected login shell. */
export interface ShellCommandExecutor {
  /**
   * @param file - The shell executable path.
   * @param args - Arguments passed directly to the shell executable.
   * @param environment - Environment variables supplied to the shell process.
   * @returns The command's standard output.
   */
  (file: string, args: string[], environment: NodeJS.ProcessEnv): Promise<string>;
}

/** Dependencies used to resolve shell environment variables. */
export interface ShellEnvironmentDependencies {
  /** Operating system platform whose environment is being resolved. */
  platform: NodeJS.Platform;
  /** Current process environment. */
  environment: NodeJS.ProcessEnv;
  /** Locates an available login shell. */
  getShell: () => Promise<string>;
  /** Executes an environment query through the login shell. */
  execute: ShellCommandExecutor;
}

const defaultShellLookupDependencies: ShellLookupDependencies = {
  getUserShell: () => userInfo().shell || process.env.SHELL || '',
  shellExists: shell => fsPromises.stat(shell),
};

const executeShellCommand: ShellCommandExecutor = async (file, args, environment) => {
  const { stdout } = await execFilePromisify(file, args, {
    encoding: 'utf8',
    timeout: 10000,
    env: environment,
  });
  return stdout;
};

/**
 * Returns the user's preferred shell or an available fallback shell.
 *
 * @param dependencies - Shell lookup operations, injectable for testing.
 * @returns A promise that resolves to the shell path.
 */
export async function getShell(
  dependencies: ShellLookupDependencies = defaultShellLookupDependencies
): Promise<string> {
  const shells = ['/bin/zsh', '/bin/bash', '/bin/sh'];

  try {
    const userShell = dependencies.getUserShell();
    if (userShell) {
      shells.unshift(userShell);
    }
  } catch (error) {
    console.error('Failed to get user shell:', error);
  }

  for (const shell of shells) {
    try {
      await dependencies.shellExists(shell);
      return shell;
    } catch (error) {
      console.error(`Shell not found: ${shell}, error: ${error}`);
    }
  }

  console.error('No valid shell found, defaulting to /bin/sh');
  return '/bin/sh';
}

/**
 * Retrieves environment variables from the user's shell.
 *
 * @param dependencies - Platform and shell operations, injectable for testing.
 * @returns A promise that resolves to the shell environment.
 */
export async function getShellEnv(
  dependencies: ShellEnvironmentDependencies = {
    platform: process.platform,
    environment: process.env,
    getShell,
    execute: executeShellCommand,
  }
): Promise<NodeJS.ProcessEnv> {
  const isWindows = dependencies.platform === 'win32';

  // For Windows, just return the current environment
  if (isWindows) {
    return { ...dependencies.environment };
  }

  // For Unix-like systems, get the shell
  const shell = await dependencies.getShell();
  const isZsh = shell.includes('zsh');
  // interactive is supported only on zsh
  const shellArgs = isZsh ? ['--login', '--interactive', '-c'] : ['--login', '-c'];

  try {
    const environment = { ...dependencies.environment, DISABLE_AUTO_UPDATE: 'true' };
    let stdout: string;
    let isEnvNull = false;

    try {
      stdout = await dependencies.execute(shell, [...shellArgs, 'env -0'], environment);
      isEnvNull = true;
    } catch {
      console.log('env -0 failed, falling back to env');
      stdout = await dependencies.execute(shell, [...shellArgs, 'env'], environment);
    }

    const processLines = (separator: string) => {
      return stdout.split(separator).reduce((acc, line) => {
        const firstEqualIndex = line.indexOf('=');
        if (firstEqualIndex > 0) {
          const key = line.slice(0, firstEqualIndex);
          const value = line.slice(firstEqualIndex + 1);
          acc[key] = value;
        }
        return acc;
      }, {} as NodeJS.ProcessEnv);
    };

    const envVars = isEnvNull ? processLines('\0') : processLines('\n');
    return { ...dependencies.environment, ...envVars };
  } catch (error) {
    console.error('Failed to get shell environment:', error);
    return dependencies.environment;
  }
}

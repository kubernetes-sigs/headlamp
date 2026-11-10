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

import { execFileSync } from 'child_process';
import path from 'path';

type ExecuteListPlugins = (file: string, args: string[]) => Buffer;
type WriteOutput = (output: Buffer) => unknown;
type ReportError = (error: unknown) => unknown;

/**
 * Runs the backend's `list-plugins` command and forwards its output.
 *
 * @param resourcesPath - Directory containing the packaged Headlamp backend executable.
 * @param execute - Synchronous executable runner used to invoke the backend.
 * @param writeOutput - Callback that receives the backend's standard output.
 * @param reportError - Callback that receives command or output handling errors.
 * @returns `0` when the command and output handling succeed; otherwise `1`.
 */
export function runListPluginsCommand(
  resourcesPath: string,
  execute: ExecuteListPlugins = execFileSync,
  writeOutput: WriteOutput = output => process.stdout.write(output),
  reportError: ReportError = error => console.error(`Error listing plugins: ${error}`)
): number {
  try {
    const backendPath = path.join(resourcesPath, 'headlamp-server');
    const stdout = execute(backendPath, ['list-plugins']);
    writeOutput(stdout);
    return 0;
  } catch (error) {
    reportError(error);
    return 1;
  }
}

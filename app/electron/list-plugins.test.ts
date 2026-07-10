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

import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { runListPluginsCommand } from './list-plugins';

const execFileSync = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({ execFileSync }));

describe('runListPluginsCommand', () => {
  it('writes the plugin list and succeeds', () => {
    const output = Buffer.from('plugin-one\nplugin-two\n');
    const execute = vi.fn(() => output);
    const writeOutput = vi.fn();
    const reportError = vi.fn();
    const resourcesPath = path.join('resources with spaces');

    const exitCode = runListPluginsCommand(resourcesPath, execute, writeOutput, reportError);

    expect(exitCode).toBe(0);
    expect(execute).toHaveBeenCalledWith(path.join(resourcesPath, 'headlamp-server'), [
      'list-plugins',
    ]);
    expect(writeOutput).toHaveBeenCalledWith(output);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('reports execution errors and fails', () => {
    const error = new Error('backend failed');
    const execute = vi.fn(() => {
      throw error;
    });
    const writeOutput = vi.fn();
    const reportError = vi.fn();

    const exitCode = runListPluginsCommand('resources', execute, writeOutput, reportError);

    expect(exitCode).toBe(1);
    expect(writeOutput).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledWith(error);
  });

  it('uses the process streams by default', () => {
    const output = Buffer.from('plugin-one\n');
    execFileSync.mockReturnValue(output);
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const exitCode = runListPluginsCommand('resources');

    expect(exitCode).toBe(0);
    expect(execFileSync).toHaveBeenCalledWith(path.join('resources', 'headlamp-server'), [
      'list-plugins',
    ]);
    expect(write).toHaveBeenCalledWith(output);
    write.mockRestore();
  });

  it('reports errors to the console by default', () => {
    const error = new Error('backend failed');
    execFileSync.mockImplementation(() => {
      throw error;
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const exitCode = runListPluginsCommand('resources');

    expect(exitCode).toBe(1);
    expect(consoleError).toHaveBeenCalledWith(`Error listing plugins: ${error}`);
    consoleError.mockRestore();
  });
});

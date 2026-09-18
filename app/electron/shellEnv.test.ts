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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getShell, getShellEnv, ShellEnvironmentDependencies } from './shellEnv';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getShell', () => {
  it('uses the configured user shell when it exists', async () => {
    const shellExists = vi.fn().mockResolvedValue(undefined);

    await expect(
      getShell({
        getUserShell: () => '/opt/custom-shell',
        shellExists,
      })
    ).resolves.toBe('/opt/custom-shell');
    expect(shellExists).toHaveBeenCalledOnce();
  });

  it('uses the first available fallback when user lookup fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const shellExists = vi.fn(async (shell: string) => {
      if (shell === '/bin/bash') {
        return;
      }
      throw new Error('not found');
    });

    await expect(
      getShell({
        getUserShell: () => {
          throw new Error('user lookup failed');
        },
        shellExists,
      })
    ).resolves.toBe('/bin/bash');
  });

  it('defaults to /bin/sh when no shell exists', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      getShell({
        getUserShell: () => '',
        shellExists: async () => {
          throw new Error('not found');
        },
      })
    ).resolves.toBe('/bin/sh');
  });
});

describe('getShellEnv', () => {
  const environment = { EXISTING: 'value' };

  function dependencies(
    overrides: Partial<ShellEnvironmentDependencies> = {}
  ): ShellEnvironmentDependencies {
    return {
      platform: 'linux',
      environment,
      getShell: vi.fn().mockResolvedValue('/bin/zsh'),
      execute: vi.fn().mockResolvedValue('FROM_SHELL=result\0'),
      ...overrides,
    };
  }

  it('returns a copy of the current environment on Windows', async () => {
    const getConfiguredShell = vi.fn().mockResolvedValue('/bin/zsh');
    const result = await getShellEnv(
      dependencies({ platform: 'win32', getShell: getConfiguredShell })
    );

    expect(result).toEqual(environment);
    expect(result).not.toBe(environment);
    expect(getConfiguredShell).not.toHaveBeenCalled();
  });

  it('reads null-delimited variables from an interactive zsh login shell', async () => {
    const execute = vi.fn().mockResolvedValue('FROM_SHELL=result\0WITH_EQUALS=one=two\0invalid\0');

    await expect(getShellEnv(dependencies({ execute }))).resolves.toEqual({
      EXISTING: 'value',
      FROM_SHELL: 'result',
      WITH_EQUALS: 'one=two',
    });
    expect(execute).toHaveBeenCalledWith('/bin/zsh', ['--login', '--interactive', '-c', 'env -0'], {
      EXISTING: 'value',
      DISABLE_AUTO_UPDATE: 'true',
    });
  });

  it('uses a non-interactive login shell outside zsh', async () => {
    const execute = vi.fn().mockResolvedValue('FROM_BASH=result\0');

    await expect(
      getShellEnv(dependencies({ getShell: vi.fn().mockResolvedValue('/bin/bash'), execute }))
    ).resolves.toMatchObject({ FROM_BASH: 'result' });
    expect(execute).toHaveBeenCalledWith(
      '/bin/bash',
      ['--login', '-c', 'env -0'],
      expect.any(Object)
    );
  });

  it('passes the shell path as a literal executable instead of shell syntax', async () => {
    const execute = vi.fn().mockResolvedValue('FROM_SHELL=result\0');
    const shell = "/opt/My Shell/bin/zsh'; touch /tmp/injected; '";

    await getShellEnv(dependencies({ getShell: vi.fn().mockResolvedValue(shell), execute }));

    expect(execute).toHaveBeenCalledWith(
      shell,
      ['--login', '--interactive', '-c', 'env -0'],
      expect.any(Object)
    );
  });

  it('falls back to newline-delimited env output', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error('env -0 unsupported'))
      .mockResolvedValueOnce('FIRST=one\nSECOND=two\n');

    await expect(getShellEnv(dependencies({ execute }))).resolves.toMatchObject({
      FIRST: 'one',
      SECOND: 'two',
    });
    expect(execute).toHaveBeenLastCalledWith(
      '/bin/zsh',
      ['--login', '--interactive', '-c', 'env'],
      expect.any(Object)
    );
  });

  it('returns the process environment when shell queries fail', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      getShellEnv(dependencies({ execute: vi.fn().mockRejectedValue(new Error('failed')) }))
    ).resolves.toBe(environment);
  });
});

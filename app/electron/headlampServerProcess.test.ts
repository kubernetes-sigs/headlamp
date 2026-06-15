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

import { describe, expect, it } from 'vitest';
import {
  filterCurrentUserHeadlampProcesses,
  isHeadlampProcessOnPort,
  isWindowsProcessOwnerCurrentUser,
} from './headlampServerProcess';

describe('isHeadlampProcessOnPort', () => {
  it('matches Headlamp server processes using --port=value', () => {
    expect(isHeadlampProcessOnPort({ pid: 1, cmd: 'headlamp-server --port=4467' }, 4467)).toBe(
      true
    );
  });

  it('matches Headlamp server processes using --port value', () => {
    expect(isHeadlampProcessOnPort({ pid: 1, cmd: 'headlamp-server --port 4468' }, 4468)).toBe(
      true
    );
  });

  it('matches the default port when the command has no explicit port', () => {
    expect(
      isHeadlampProcessOnPort({ pid: 1, cmd: 'headlamp-server --listen-addr=localhost' }, 4466)
    ).toBe(true);
  });

  it('does not match processes without command line data', () => {
    expect(isHeadlampProcessOnPort({ pid: 1 }, 4466)).toBe(false);
  });
});

describe('isWindowsProcessOwnerCurrentUser', () => {
  const currentUser = { domain: 'contoso', username: 'alice' };

  it('matches the current Windows domain user case-insensitively', () => {
    expect(isWindowsProcessOwnerCurrentUser('CONTOSO\\Alice', currentUser)).toBe(true);
  });

  it('matches owner strings without a domain', () => {
    expect(isWindowsProcessOwnerCurrentUser('Alice', currentUser)).toBe(true);
  });

  it('does not match another Windows user', () => {
    expect(isWindowsProcessOwnerCurrentUser('CONTOSO\\Bob', currentUser)).toBe(false);
  });

  it('does not match the same user name from another domain', () => {
    expect(isWindowsProcessOwnerCurrentUser('FABRIKAM\\Alice', currentUser)).toBe(false);
  });
});

describe('filterCurrentUserHeadlampProcesses', () => {
  const processes = [
    { pid: 1, cmd: 'headlamp-server --port=4466' },
    { pid: 2, cmd: 'headlamp-server --port=4467' },
    { pid: 3, cmd: 'headlamp-server --port=4468' },
  ];

  it('keeps all Headlamp processes on non-Windows platforms', async () => {
    await expect(
      filterCurrentUserHeadlampProcesses(processes, { platform: 'linux' })
    ).resolves.toEqual(processes);
  });

  it('keeps only Headlamp processes owned by the current Windows user', async () => {
    const currentUser = { domain: 'contoso', username: 'alice' };
    const ownerByPid = new Map([
      [1, 'CONTOSO\\Alice'],
      [2, 'CONTOSO\\Bob'],
      [3, null],
    ]);

    await expect(
      filterCurrentUserHeadlampProcesses(processes, {
        currentUser,
        getProcessOwner: async pid => ownerByPid.get(pid) ?? null,
        platform: 'win32',
      })
    ).resolves.toEqual([processes[0]]);
  });
});

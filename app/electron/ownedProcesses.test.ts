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

const execFileMock = vi.hoisted(() => vi.fn());
const userInfoMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ execFile: execFileMock }));
vi.mock('node:os', () => ({ userInfo: userInfoMock }));

import { filterUserOwnedPids } from './ownedProcesses';

// tasklist /V /FO CSV output with two users.
const TASKLIST_CSV = [
  '"headlamp-server.exe","100","Console","1","10,000 K","Running","MACHINE\\alice","0:00:01","N/A"',
  '"headlamp-server.exe","200","Console","2","10,000 K","Running","MACHINE\\bob","0:00:01","N/A"',
  '"headlamp-server.exe","300","Console","1","10,000 K","Running","MACHINE\\ALICE","0:00:01","N/A"',
].join('\r\n');

function mockPlatform(platform: string) {
  const original = process.platform;
  Object.defineProperty(process, 'platform', { value: platform });
  return () => Object.defineProperty(process, 'platform', { value: original });
}

// The module uses promisify(execFile), which resolves {stdout, stderr} via
// the promisify.custom hook on the real execFile. Recreate that on the mock.
function mockExecFileResult(stdout: string | Error) {
  execFileMock.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
    const callback = typeof _opts === 'function' ? _opts : cb;
    if (stdout instanceof Error) {
      callback(stdout);
    } else {
      callback(null, { stdout, stderr: '' });
    }
  });
}

describe('filterUserOwnedPids', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array for empty input', async () => {
    expect(await filterUserOwnedPids([])).toEqual([]);
  });

  describe('on Windows', () => {
    it('keeps only PIDs owned by the current user, case-insensitively', async () => {
      const restore = mockPlatform('win32');

      try {
        userInfoMock.mockReturnValue({ username: 'Alice' });
        mockExecFileResult(TASKLIST_CSV);

        // 100 and 300 belong to alice/ALICE, 200 belongs to bob, 999 is unknown.
        expect(await filterUserOwnedPids([100, 200, 300, 999])).toEqual([100, 300]);
      } finally {
        restore();
      }
    });

    it('matches when the current username includes a domain prefix', async () => {
      const restore = mockPlatform('win32');

      try {
        userInfoMock.mockReturnValue({ username: 'MACHINE\\Alice' });
        mockExecFileResult(TASKLIST_CSV);

        expect(await filterUserOwnedPids([100, 200, 300])).toEqual([100, 300]);
      } finally {
        restore();
      }
    });

    it('correctly parses CSV rows with commas inside quoted fields', async () => {
      const restore = mockPlatform('win32');

      try {
        userInfoMock.mockReturnValue({ username: 'alice' });
        // Window title field contains a comma, which would break a naive split.
        const csvWithComma = [
          '"headlamp-server.exe","100","Console","1","10,000 K","Running","MACHINE\\alice","0:00:01","Window, with comma"',
        ].join('\r\n');
        mockExecFileResult(csvWithComma);

        expect(await filterUserOwnedPids([100])).toEqual([100]);
      } finally {
        restore();
      }
    });

    it('fails closed and returns no PIDs when tasklist fails', async () => {
      const restore = mockPlatform('win32');

      try {
        userInfoMock.mockReturnValue({ username: 'alice' });
        mockExecFileResult(new Error('tasklist not found'));

        expect(await filterUserOwnedPids([100, 200])).toEqual([]);
      } finally {
        restore();
      }
    });

    it('fails closed and returns no PIDs when userInfo throws', async () => {
      const restore = mockPlatform('win32');

      try {
        userInfoMock.mockImplementation(() => {
          throw new Error('uv_os_get_passwd returned ENOENT');
        });
        mockExecFileResult(TASKLIST_CSV);

        expect(await filterUserOwnedPids([100, 200])).toEqual([]);
        // The username lookup failed, so no process listing should be attempted.
        expect(execFileMock).not.toHaveBeenCalled();
      } finally {
        restore();
      }
    });
  });

  describe('on POSIX', () => {
    it('keeps PIDs that accept signal 0 and drops those that do not', async () => {
      const restore = mockPlatform('linux');
      const killSpy = vi.spyOn(process, 'kill').mockImplementation((pid: number) => {
        if (pid === 200) {
          // Another user's process: exists but not signalable.
          const err: NodeJS.ErrnoException = new Error('operation not permitted');
          err.code = 'EPERM';
          throw err;
        }
        return true;
      });

      try {
        expect(await filterUserOwnedPids([100, 200, 300])).toEqual([100, 300]);
        expect(killSpy).toHaveBeenCalledWith(100, 0);
        expect(killSpy).toHaveBeenCalledWith(200, 0);
      } finally {
        killSpy.mockRestore();
        restore();
      }
    });

    it('drops non-positive and non-integer PIDs without signalling them', async () => {
      const restore = mockPlatform('linux');
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      try {
        expect(await filterUserOwnedPids([0, -1, 1.5, 100])).toEqual([100]);
        expect(killSpy).toHaveBeenCalledTimes(1);
        expect(killSpy).toHaveBeenCalledWith(100, 0);
      } finally {
        killSpy.mockRestore();
        restore();
      }
    });

    it('fails closed and returns no PIDs when running as root', async () => {
      const restore = mockPlatform('linux');
      // process.getuid doesn't exist on Windows hosts, so stub it directly
      // instead of spying.
      const origGetuid = process.getuid;
      process.getuid = () => 0;
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      try {
        expect(await filterUserOwnedPids([100, 200])).toEqual([]);
        expect(killSpy).not.toHaveBeenCalled();
      } finally {
        killSpy.mockRestore();
        process.getuid = origGetuid;
        restore();
      }
    });
  });
});

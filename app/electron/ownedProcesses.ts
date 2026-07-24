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
import { userInfo } from 'node:os';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

/**
 * Returns the subset of PIDs owned by the user running this process.
 *
 * On shared machines (e.g. Windows remote desktop servers) matching processes
 * by name finds every user's headlamp-server. Killing those would take down
 * other users' sessions, so kill paths must filter through this first.
 */
export async function filterUserOwnedPids(pids: number[]): Promise<number[]> {
  if (pids.length === 0) {
    return [];
  }

  if (process.platform === 'win32') {
    return filterOwnedPidsWindows(pids);
  }

  return filterOwnedPidsPosix(pids);
}

/**
 * Parse a single RFC4180 CSV line into an array of field values.
 *
 * Handles quoted fields and doubled-quote escapes (e.g. `"a ""b"" c"` → `a "b" c`).
 * tasklist /V /FO CSV uses this format and fields like window titles can contain
 * commas, so a naive split on `","` would mis-split.
 */
function parseCsvLine(line: string): string[] {
  const columns: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Doubled quote inside a quoted field → literal quote.
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      columns.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  columns.push(current);
  return columns;
}

/**
 * Windows: list the current user's processes once via tasklist and keep only
 * the given PIDs that appear in it.
 */
async function filterOwnedPidsWindows(pids: number[]): Promise<number[]> {
  // userInfo().username may include a domain prefix (DOMAIN\user) depending
  // on the environment; strip it the same way as the tasklist owner below.
  // userInfo() itself can throw in some environments (e.g. no user entry).
  let username: string;
  try {
    username = userInfo().username.split('\\').pop()?.toLowerCase() ?? '';
  } catch (err) {
    console.error('Failed to determine current username for ownership check:', err);
    // Fail closed: better to not kill anything than kill another user's server.
    return [];
  }

  let stdout: string;
  try {
    ({ stdout } = await execFileP('tasklist', ['/V', '/FO', 'CSV', '/NH'], {
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    }));
  } catch (err) {
    console.error('Failed to list processes for ownership check:', err);
    // Fail closed: better to not kill anything than kill another user's server.
    return [];
  }

  const ownedPids = new Set<number>();

  for (const line of stdout.split(/\r?\n/)) {
    if (!line) {
      continue;
    }

    // tasklist /V /FO CSV produces RFC4180-style CSV (quoted fields, doubled-
    // quote escapes). A naive split on '","' mis-splits when fields like
    // window titles contain commas. Parse properly.
    const columns = parseCsvLine(line);
    if (columns.length < 7) {
      continue;
    }

    const pid = parseInt(columns[1], 10);
    // User Name is DOMAIN\user; compare the user part case-insensitively.
    const owner = columns[6].split('\\').pop()?.toLowerCase();

    if (!isNaN(pid) && owner === username) {
      ownedPids.add(pid);
    }
  }

  return pids.filter(pid => ownedPids.has(pid));
}

/**
 * POSIX: signal 0 probes a process without killing it. EPERM means the
 * process exists but belongs to another user.
 */
function filterOwnedPidsPosix(pids: number[]): number[] {
  // With elevated privileges, signal-0 probes succeed on every process, so
  // they don't indicate ownership. Fail closed: better to not kill anything
  // than kill another user's server.
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    return [];
  }

  return pids.filter(pid => {
    // Guard against pid 0 / negative pids, which signal process groups.
    if (!Number.isInteger(pid) || pid <= 0) {
      return false;
    }

    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  });
}

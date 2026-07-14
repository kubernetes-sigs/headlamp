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

const execFileAsync = promisify(execFile);
const DEFAULT_OWNER_LOOKUP_CONCURRENCY = 8;

/**
 * Information about a running Headlamp server process.
 */
export interface HeadlampProcessInfo {
  /** The operating-system process identifier. */
  pid: number;
  /** The full command line used to start the process, if available. */
  cmd?: string;
}

/**
 * A parsed Windows user account consisting of an optional domain and a username.
 */
export interface WindowsUser {
  /** The SAM-compatible username (lower-cased, trimmed). */
  username: string;
  /** The Windows domain or machine name (lower-cased, trimmed), if present. */
  domain?: string;
}

/**
 * Normalises a single component of a Windows account string by trimming
 * surrounding whitespace and converting to lower-case.
 *
 * @param value - The raw account component to normalise, or `undefined`.
 * @returns The normalised string; an empty string when `value` is falsy.
 */
function normalizeAccountPart(value?: string): string {
  return (value || '').trim().toLowerCase();
}

/**
 * Parses a Windows account string of the form `[DOMAIN\]username` into its
 * constituent parts.
 *
 * Both back-slash (`\`) and forward-slash (`/`) are accepted as the
 * domain–username separator.  Only the *last* separator is used, so accounts
 * whose domain portion itself contains a separator are handled correctly.
 *
 * @param account - The raw account string to parse (e.g. `"CORP\alice"` or
 *   `"alice"`).
 * @returns A {@link WindowsUser} object with normalised `username` and,
 *   when present, `domain` fields.
 */
function parseWindowsAccount(account: string): WindowsUser {
  const normalizedAccount = account.trim().replaceAll('/', '\\');
  const separatorIndex = normalizedAccount.lastIndexOf('\\');

  if (separatorIndex === -1) {
    return {
      username: normalizeAccountPart(normalizedAccount),
    };
  }

  return {
    domain: normalizeAccountPart(normalizedAccount.slice(0, separatorIndex)),
    username: normalizeAccountPart(normalizedAccount.slice(separatorIndex + 1)),
  };
}

/**
 * Returns the Windows user account that is running the current process.
 *
 * The domain is taken from the `USERDOMAIN` environment variable (if set).
 * The username is taken from the `USERNAME` environment variable, falling back
 * to {@link https://nodejs.org/api/os.html#osuserinfooptions | `os.userInfo()`}
 * when the environment variable is absent.
 *
 * @returns A {@link WindowsUser} with normalised `domain` and `username` fields.
 */
export function getCurrentWindowsUser(): WindowsUser {
  let username = process.env.USERNAME;
  if (!username) {
    try {
      username = userInfo().username;
    } catch {
      username = '';
    }
  }

  return {
    domain: normalizeAccountPart(process.env.USERDOMAIN) || undefined,
    username: normalizeAccountPart(username),
  };
}

/**
 * Determines whether a Windows process owner string refers to the supplied
 * current user.
 *
 * Matching rules:
 * - An empty or whitespace-only `owner` string is never considered a match.
 * - Usernames must match exactly (case-insensitive, after normalisation).
 * - If the owner includes a domain but the current user's domain is missing,
 *   the owner is treated as non-matching.
 * - If both sides supply a domain, they must match (case-insensitive).
 *
 * @param owner - The raw owner string returned by `Win32_Process.GetOwner`
 *   (e.g. `"CORP\\alice"`).
 * @param currentUser - The current user to compare against, as returned by
 *   {@link getCurrentWindowsUser}.
 * @returns `true` when `owner` refers to `currentUser`; `false` otherwise.
 */
export function isWindowsProcessOwnerCurrentUser(owner: string, currentUser: WindowsUser): boolean {
  if (!owner.trim()) {
    return false;
  }

  const processOwner = parseWindowsAccount(owner);
  if (processOwner.username !== currentUser.username) {
    return false;
  }

  // If the process owner doesn't report a domain, fall back to username match.
  if (!processOwner.domain) {
    return true;
  }

  // If we can't determine the current user's domain, don't match a domain-qualified owner.
  if (!currentUser.domain) {
    return false;
  }

  return processOwner.domain === currentUser.domain;
}

/**
 * Queries the owner of a Windows process by its PID using PowerShell and the
 * WMI `Win32_Process` CIM class.
 *
 * The function shells out to `powershell.exe` and is therefore only meaningful
 * on Windows.  Errors (e.g. access-denied, process not found) are swallowed
 * and produce a `null` return value so that the caller can decide how to
 * proceed.
 *
 * @param pid - The process identifier to query.
 * @returns A promise that resolves to a `"DOMAIN\\username"` string when the
 *   owner can be determined, or `null` on failure or when the process no
 *   longer exists.
 */
export async function getWindowsProcessOwner(pid: number): Promise<string | null> {
  try {
    const command = [
      `$process = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}"`,
      'if ($null -eq $process) { exit 0 }',
      '$owner = Invoke-CimMethod -InputObject $process -MethodName GetOwner',
      'if ($owner.ReturnValue -eq 0) { Write-Output "$($owner.Domain)\\$($owner.User)" }',
    ].join('; ');

    const powershellExe = `${
      process.env.SystemRoot ?? 'C:\\Windows'
    }\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;

    const { stdout } = await execFileAsync(
      powershellExe,
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { windowsHide: true }
    );

    const owner = stdout.trim();
    return owner || null;
  } catch (error) {
    console.warn(`Failed to get owner for Headlamp process ${pid}:`, error);
    return null;
  }
}

/**
 * Filters a list of Headlamp processes to only those owned by the current
 * Windows user.
 *
 * On non-Windows platforms the full `processes` array is returned unchanged
 * because process-isolation by owner is not required.
 *
 * Owner lookups are performed concurrently up to `ownerLookupConcurrency`
 * simultaneous requests (default: {@link DEFAULT_OWNER_LOOKUP_CONCURRENCY})
 * to balance speed against system load.
 *
 * @param processes - The full list of candidate {@link HeadlampProcessInfo}
 *   objects to filter.
 * @param options - Optional overrides for testability and platform behaviour.
 * @param options.currentUser - The user to match against; defaults to
 *   {@link getCurrentWindowsUser}.
 * @param options.getProcessOwner - A function to resolve the owner of a PID;
 *   defaults to {@link getWindowsProcessOwner}.
 * @param options.ownerLookupConcurrency - Maximum number of concurrent owner
 *   lookups; defaults to {@link DEFAULT_OWNER_LOOKUP_CONCURRENCY}.
 * @param options.platform - The platform string to act upon; defaults to
 *   `process.platform`.
 * @returns A promise that resolves to the subset of `processes` owned by the
 *   current user, or the full `processes` array on non-Windows platforms.
 */
export async function filterCurrentUserHeadlampProcesses(
  processes: HeadlampProcessInfo[],
  options: {
    currentUser?: WindowsUser;
    getProcessOwner?: (pid: number) => Promise<string | null>;
    ownerLookupConcurrency?: number;
    platform?: NodeJS.Platform;
  } = {}
): Promise<HeadlampProcessInfo[]> {
  const platform = options.platform ?? process.platform;
  if (platform !== 'win32') {
    return processes;
  }

  const currentUser = options.currentUser ?? getCurrentWindowsUser();
  const getProcessOwner = options.getProcessOwner ?? getWindowsProcessOwner;
  const ownerLookupConcurrency = Math.max(
    1,
    Math.floor(options.ownerLookupConcurrency ?? DEFAULT_OWNER_LOOKUP_CONCURRENCY)
  );

  const processOwners = await mapWithConcurrency(processes, ownerLookupConcurrency, getOwner);

  return processOwners.filter(
    (processOwner): processOwner is HeadlampProcessInfo => processOwner !== null
  );

  async function getOwner(processInfo: HeadlampProcessInfo): Promise<HeadlampProcessInfo | null> {
    const owner = await getProcessOwner(processInfo.pid);
    if (!!owner && isWindowsProcessOwnerCurrentUser(owner, currentUser)) {
      return processInfo;
    }

    return null;
  }
}

/**
 * Maps over an array of items concurrently, resolving up to `concurrency`
 * promises at a time.
 *
 * Items are processed in index order; results are stored at their original
 * positions so the output array length and order always match the input.
 *
 * @typeParam T - The type of each input item.
 * @typeParam TResult - The type of each mapped result.
 * @param items - The array of items to process.
 * @param concurrency - The maximum number of concurrent `mapper` invocations.
 *   Must be a positive integer; values ≤ 0 are treated as 1 by the caller.
 * @param mapper - An async function applied to each item.
 * @returns A promise that resolves to an array of results in the same order as
 *   `items`.
 */
async function mapWithConcurrency<T, TResult>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<TResult>
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Checks whether a Headlamp process is listening on a specific port by
 * inspecting its command line.
 *
 * The function looks for a `--port=<n>` or `--port <n>` argument in the
 * process's command line.  When no `--port` argument is present the process is
 * assumed to be using the default port `4466`.
 *
 * @param processInfo - The {@link HeadlampProcessInfo} whose command line will
 *   be inspected.
 * @param port - The port number to test for.
 * @returns `true` when the process appears to be bound to `port`; `false`
 *   when the command line is unavailable or the port does not match.
 */
export function isHeadlampProcessOnPort(processInfo: HeadlampProcessInfo, port: number): boolean {
  const commandLine = processInfo.cmd;
  if (!commandLine) {
    return false;
  }

  const portRegex = /--port[=\s]+(\d+)/;
  const match = commandLine.match(portRegex);

  if (match && match[1]) {
    return parseInt(match[1], 10) === port;
  }

  return port === 4466 && !commandLine.includes('--port');
}

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

export interface HeadlampProcessInfo {
  pid: number;
  cmd?: string;
}

interface WindowsUser {
  username: string;
  domain?: string;
}

function normalizeAccountPart(value?: string): string {
  return (value || '').trim().toLocaleLowerCase();
}

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

export function getCurrentWindowsUser(): WindowsUser {
  return {
    domain: normalizeAccountPart(process.env.USERDOMAIN),
    username: normalizeAccountPart(process.env.USERNAME || userInfo().username),
  };
}

export function isWindowsProcessOwnerCurrentUser(owner: string, currentUser: WindowsUser): boolean {
  if (!owner.trim()) {
    return false;
  }

  const processOwner = parseWindowsAccount(owner);
  if (processOwner.username !== currentUser.username) {
    return false;
  }

  return !processOwner.domain || !currentUser.domain || processOwner.domain === currentUser.domain;
}

export async function getWindowsProcessOwner(pid: number): Promise<string | null> {
  try {
    const command = [
      `$process = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}"`,
      'if ($null -eq $process) { exit 0 }',
      '$owner = Invoke-CimMethod -InputObject $process -MethodName GetOwner',
      'if ($owner.ReturnValue -eq 0) { Write-Output "$($owner.Domain)\\$($owner.User)" }',
    ].join('; ');

    const { stdout } = await execFileAsync(
      'powershell.exe',
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

export async function filterCurrentUserHeadlampProcesses(
  processes: HeadlampProcessInfo[],
  options: {
    currentUser?: WindowsUser;
    getProcessOwner?: (pid: number) => Promise<string | null>;
    platform?: NodeJS.Platform;
  } = {}
): Promise<HeadlampProcessInfo[]> {
  const platform = options.platform ?? process.platform;
  if (platform !== 'win32') {
    return processes;
  }

  const currentUser = options.currentUser ?? getCurrentWindowsUser();
  const getProcessOwner = options.getProcessOwner ?? getWindowsProcessOwner;
  const currentUserProcesses: HeadlampProcessInfo[] = [];

  for (const processInfo of processes) {
    const owner = await getProcessOwner(processInfo.pid);
    if (!!owner && isWindowsProcessOwnerCurrentUser(owner, currentUser)) {
      currentUserProcesses.push(processInfo);
    }
  }

  return currentUserProcesses;
}

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

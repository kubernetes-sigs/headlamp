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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runCommand } from './runCommand';

describe('runCommand', () => {
  beforeEach(() => {
    window.desktopApi = {};
  });

  it('requires Headlamp app mode', () => {
    window.desktopApi = undefined;

    expect(() => runCommand('gh', [], {}, {}, vi.fn(), vi.fn())).toThrow(
      'runCommand only works in Headlamp app mode.'
    );
  });

  it('requires the private IPC dependencies', () => {
    expect(() => runCommand('gh', [], {})).toThrow('Do not use runCommand directly.');
  });

  it('sends the command and forwards events for its command ID', () => {
    const listeners = new Map<string, (id: string, data: string | number) => void>();
    const send = vi.fn();
    const receive = vi.fn(
      (channel: string, listener: (id: string, data: string | number) => void) => {
        listeners.set(channel, listener);
      }
    );
    const command = runCommand(
      'gh',
      ['auth', 'status'],
      { cwd: '/tmp' },
      { TOKEN: 7 },
      send,
      receive
    );
    const commandId = send.mock.calls[0][1].id;
    const stdout = vi.fn();
    const stderr = vi.fn();
    const exit = vi.fn();

    command.stdout.on('data', stdout);
    command.stderr.on('data', stderr);
    command.on('exit', exit);

    listeners.get('command-stdout')?.('another-command', 'ignored');
    listeners.get('command-stderr')?.('another-command', 'ignored');
    listeners.get('command-exit')?.('another-command', 1);
    listeners.get('command-stdout')?.(commandId, 'output');
    listeners.get('command-stderr')?.(commandId, 'warning');
    listeners.get('command-exit')?.(commandId, 0);

    expect(send).toHaveBeenCalledWith('run-command', {
      id: commandId,
      command: 'gh',
      args: ['auth', 'status'],
      options: { cwd: '/tmp' },
      permissionSecrets: { TOKEN: 7 },
    });
    expect(stdout).toHaveBeenCalledOnce();
    expect(stdout).toHaveBeenCalledWith('output');
    expect(stderr).toHaveBeenCalledOnce();
    expect(stderr).toHaveBeenCalledWith('warning');
    expect(exit).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('removes command listeners after the matching command exits', () => {
    const listeners = new Map<string, (id: string, data: string | number) => void>();
    const removers = new Map<string, ReturnType<typeof vi.fn>>();
    const send = vi.fn();
    const receive = vi.fn(
      (channel: string, listener: (id: string, data: string | number) => void) => {
        const remove = vi.fn();
        listeners.set(channel, listener);
        removers.set(channel, remove);
        return remove;
      }
    );

    runCommand('gh', ['auth', 'status'], {}, {}, send, receive);
    const commandId = send.mock.calls[0][1].id;

    listeners.get('command-exit')?.(commandId, 0);

    expect([...removers.values()]).toHaveLength(3);
    for (const remove of removers.values()) {
      expect(remove).toHaveBeenCalledOnce();
    }
  });

  it('keeps listeners for another command exit', () => {
    const listeners = new Map<string, (id: string, data: string | number) => void>();
    const removers: Array<ReturnType<typeof vi.fn>> = [];
    const receive = vi.fn(
      (channel: string, listener: (id: string, data: string | number) => void) => {
        const remove = vi.fn();
        listeners.set(channel, listener);
        removers.push(remove);
        return remove;
      }
    );

    runCommand('gh', ['auth', 'status'], {}, {}, vi.fn(), receive);
    listeners.get('command-exit')?.('another-command', 0);

    for (const remove of removers) {
      expect(remove).not.toHaveBeenCalled();
    }
  });
});

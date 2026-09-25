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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runCommand } from './runCommand';

describe('runCommand', () => {
  beforeEach(() => {
    vi.stubGlobal('desktopApi', {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Creates a fake desktopApiReceive that tracks registered/unsubscribed listeners per channel. */
  function createFakeDesktopApiReceive() {
    const listenersByChannel: Record<string, Array<(...args: any[]) => void>> = {};

    const desktopApiReceive = vi.fn((channel: string, listener: (...args: any[]) => void) => {
      listenersByChannel[channel] = [...(listenersByChannel[channel] ?? []), listener];

      return () => {
        listenersByChannel[channel] = (listenersByChannel[channel] ?? []).filter(
          it => it !== listener
        );
      };
    });

    return {
      desktopApiReceive,
      listenersByChannel,
      emit(channel: string, ...args: any[]) {
        (listenersByChannel[channel] ?? []).forEach(listener => listener(...args));
      },
      countListeners(channel: string) {
        return (listenersByChannel[channel] ?? []).length;
      },
    };
  }

  it('removes all 3 listeners once the command exits', () => {
    const { desktopApiReceive, emit, countListeners } = createFakeDesktopApiReceive();
    const desktopApiSend = vi.fn();

    const cmd = runCommand('minikube', ['status'], {}, {}, desktopApiSend, desktopApiReceive);

    const exitListener = vi.fn();
    cmd.on('exit', exitListener);

    // The id sent to desktopApiSend is what the main process will echo back.
    const sentId = desktopApiSend.mock.calls[0][1].id;

    expect(countListeners('command-stdout')).toBe(1);
    expect(countListeners('command-stderr')).toBe(1);
    expect(countListeners('command-exit')).toBe(1);

    emit('command-exit', sentId, 0);

    expect(exitListener).toHaveBeenCalledWith(0);
    expect(countListeners('command-stdout')).toBe(0);
    expect(countListeners('command-stderr')).toBe(0);
    expect(countListeners('command-exit')).toBe(0);
  });

  it('does not leak listeners across multiple sequential calls', () => {
    const { desktopApiReceive, emit, countListeners } = createFakeDesktopApiReceive();
    const desktopApiSend = vi.fn();

    for (let i = 0; i < 5; i++) {
      runCommand('minikube', ['status'], {}, {}, desktopApiSend, desktopApiReceive);
      const sentId = desktopApiSend.mock.calls[i][1].id;
      emit('command-exit', sentId, 0);
    }

    expect(countListeners('command-stdout')).toBe(0);
    expect(countListeners('command-stderr')).toBe(0);
    expect(countListeners('command-exit')).toBe(0);
  });

  it("does not remove a different in-flight command's listeners when this one exits", () => {
    const { desktopApiReceive, emit, countListeners } = createFakeDesktopApiReceive();
    const desktopApiSend = vi.fn();

    runCommand('minikube', ['status'], {}, {}, desktopApiSend, desktopApiReceive);
    runCommand('minikube', ['status'], {}, {}, desktopApiSend, desktopApiReceive);

    expect(countListeners('command-exit')).toBe(2);
    expect(countListeners('command-stdout')).toBe(2);
    expect(countListeners('command-stderr')).toBe(2);

    const firstId = desktopApiSend.mock.calls[0][1].id;
    emit('command-exit', firstId, 0);

    // Only the first command's listeners should be gone; the second is still running.
    expect(countListeners('command-exit')).toBe(1);
    expect(countListeners('command-stdout')).toBe(1);
    expect(countListeners('command-stderr')).toBe(1);
    window.desktopApi = { platform: 'darwin' };
  });

  it('requires Headlamp app mode', () => {
    Reflect.set(window, 'desktopApi', undefined);

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

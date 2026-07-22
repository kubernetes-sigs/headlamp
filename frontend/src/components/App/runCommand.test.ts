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
  });
});

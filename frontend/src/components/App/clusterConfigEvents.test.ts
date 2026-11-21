/*
 * Copyright 2026 The Kubernetes Authors
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

import { afterEach, expect, it, vi } from 'vitest';
import { watchClusterConfig } from './clusterConfigEvents';

vi.mock('../../lib/k8s/api/v2/webSocket', () => ({
  getBaseWsUrl: () => 'ws://localhost/headlamp/',
}));
vi.mock('../../helpers/getHeadlampAPIHeaders', () => ({
  getHeadlampWebSocketProtocol: () => 'desktop-protocol',
}));

const configMessage = '{"type":"config"}';

class TestSocket extends EventTarget {
  close = vi.fn(() => this.dispatchEvent(new Event('close')));

  sendConfig() {
    this.dispatchEvent(new MessageEvent('message', { data: configMessage }));
  }
}

function mockSockets() {
  const sockets: TestSocket[] = [];
  const open = vi.fn(function () {
    const socket = new TestSocket();
    sockets.push(socket);
    return socket;
  });
  vi.stubGlobal('WebSocket', open);
  return { sockets, open };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('authenticates, refreshes on config events and reconnects after a disconnect', async () => {
  vi.useFakeTimers();
  const { sockets, open } = mockSockets();
  const refresh = vi.fn().mockResolvedValue(undefined);
  const stop = watchClusterConfig(refresh);

  try {
    expect(open).toHaveBeenCalledWith('ws://localhost/headlamp/config/events', [
      'headlamp.config-events.v1',
      'desktop-protocol',
    ]);
    sockets[0].sendConfig();
    expect(refresh).toHaveBeenCalledTimes(1);

    sockets[0].close();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(open).toHaveBeenCalledTimes(2);
    sockets[1].sendConfig();
    expect(refresh).toHaveBeenCalledTimes(2);

    stop();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(sockets[1].close).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledTimes(2);
  } finally {
    stop();
  }
});

it('coalesces notifications while a refresh is pending', async () => {
  vi.useFakeTimers();
  const { sockets } = mockSockets();
  let finish!: () => void;
  const pending = new Promise<void>(resolve => {
    finish = resolve;
  });
  const refresh = vi.fn().mockReturnValueOnce(pending).mockResolvedValue(undefined);
  const stop = watchClusterConfig(refresh);

  try {
    sockets[0].sendConfig();
    sockets[0].sendConfig();
    sockets[0].sendConfig();
    expect(refresh).toHaveBeenCalledTimes(1);

    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(2);
  } finally {
    stop();
  }
});

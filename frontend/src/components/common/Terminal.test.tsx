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

import 'vitest-canvas-mock';
import { act, render } from '@testing-library/react';
import React from 'react';
import { TestContext } from '../../test';
import Terminal from './Terminal';

const encoder = new TextEncoder();

const Channel = {
  StdOut: 1,
} as const;

function buildMessage(channel: number, text: string): ArrayBuffer {
  const encoded = encoder.encode(text);
  const buffer = new Uint8Array([channel, ...encoded]);
  return buffer.buffer;
}

/** Minimal pod-shaped mock for Terminal (no Pod import to avoid k8s chain in isolation). */
function createMockPod(exec: (c: string, onData: (d: ArrayBuffer) => void) => Promise<unknown>) {
  return {
    metadata: { name: 'mock-pod' },
    spec: {
      nodeSelector: { 'kubernetes.io/os': 'linux' },
      containers: [{ name: 'main' }],
      initContainers: [],
      ephemeralContainers: [],
    },
    exec,
    attach: exec,
  };
}

describe('Terminal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not throw when stream emits data after unmount (send/onData after cleanup)', async () => {
    const streamReturn = {
      cancel: () => {},
      getSocket: () => ({ readyState: 1, send: () => {} } as unknown as WebSocket),
    };
    const pod = createMockPod(async (_container: string, onData: (data: ArrayBuffer) => void) => {
      await Promise.resolve();
      setTimeout(() => onData(buildMessage(Channel.StdOut, 'late data after unmount')), 5000);
      return streamReturn;
    });

    const { unmount } = render(
      <TestContext>
        <Terminal item={pod as any} open onClose={() => {}} />
      </TestContext>
    );

    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await act(() => new Promise(res => process.nextTick(res)));

    unmount();

    await act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(true).toBe(true);
  });
});

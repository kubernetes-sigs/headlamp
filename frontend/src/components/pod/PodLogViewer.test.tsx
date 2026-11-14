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

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Terminal } from '@xterm/xterm';
import React from 'react';
import { TestContext } from '../../test';
import { PodLogViewer } from './Details';

vi.mock('../../lib/k8s', () => ({}));
vi.mock('../../lib/k8s/pod', () => ({ default: vi.fn(), __esModule: true }));
vi.mock('../../lib/k8s/cluster', () => ({}));

vi.mock('../globalSearch/useLocalStorageState', () => ({
  useLocalStorageState: (_key: string, defaultValue: any) => [defaultValue, vi.fn()],
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(function () {
    return {
      open: vi.fn(),
      clear: vi.fn(),
      write: vi.fn(),
      focus: vi.fn(),
      onData: vi.fn(),
      onResize: vi.fn(),
      attachCustomKeyEventHandler: vi.fn(),
      dispose: vi.fn(),
      loadAddon: vi.fn(),
    };
  }),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(function () {
    return {
      fit: vi.fn(),
      activate: vi.fn(),
    };
  }),
}));

function makeMockPod(getLogs: (...args: any[]) => any) {
  return {
    metadata: { name: 'test-pod', namespace: 'default', uid: 'pod-uid-123' },
    spec: {
      containers: [{ name: 'nginx' }, { name: 'sidecar' }],
      initContainers: [],
      ephemeralContainers: [],
    },
    status: {
      containerStatuses: [{ name: 'nginx', state: { running: {} }, restartCount: 0 }],
    },
    getName: () => 'test-pod',
    getLogs,
  } as any;
}

describe('PodLogViewer', () => {
  describe('initialContainer', () => {
    it('uses initialContainer when it matches a known container', () => {
      const getLogs = vi.fn(() => () => {});
      render(
        <TestContext routerMap={{ namespace: 'default', name: 'test-pod' }}>
          <PodLogViewer
            open
            item={makeMockPod(getLogs)}
            onClose={() => {}}
            initialContainer="sidecar"
          />
        </TestContext>
      );

      expect(getLogs).toHaveBeenCalledWith('sidecar', expect.any(Function), expect.any(Object));
    });

    it('falls back to default container when initialContainer is invalid', () => {
      const getLogs = vi.fn(() => () => {});
      render(
        <TestContext routerMap={{ namespace: 'default', name: 'test-pod' }}>
          <PodLogViewer
            open
            item={makeMockPod(getLogs)}
            onClose={() => {}}
            initialContainer="nonexistent"
          />
        </TestContext>
      );

      expect(getLogs).toHaveBeenCalledWith('nginx', expect.any(Function), expect.any(Object));
    });

    it('uses default container when initialContainer is not specified', () => {
      const getLogs = vi.fn(() => () => {});
      render(
        <TestContext routerMap={{ namespace: 'default', name: 'test-pod' }}>
          <PodLogViewer open item={makeMockPod(getLogs)} onClose={() => {}} />
        </TestContext>
      );

      expect(getLogs).toHaveBeenCalledWith('nginx', expect.any(Function), expect.any(Object));
    });
  });

  describe('Since window', () => {
    function renderViewer(getLogs: (...args: any[]) => any) {
      render(
        <TestContext routerMap={{ namespace: 'default', name: 'test-pod' }}>
          <PodLogViewer open item={makeMockPod(getLogs)} onClose={() => {}} />
        </TestContext>
      );
    }

    async function selectSince(label: string) {
      fireEvent.mouseDown(screen.getByRole('combobox', { name: /Since/ }));
      fireEvent.click(await screen.findByRole('option', { name: label }));
    }

    function lastOptions(getLogs: any) {
      return getLogs.mock.calls[getLogs.mock.calls.length - 1][2];
    }

    it('cancels the previous request and refetches with the selected window', async () => {
      const cancel = vi.fn();
      const getLogs = vi.fn(() => cancel);
      renderViewer(getLogs);
      expect(lastOptions(getLogs).sinceSeconds).toBeUndefined();

      await selectSince('Last 15 minutes');

      await waitFor(() => expect(lastOptions(getLogs).sinceSeconds).toBe(900));
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(getLogs).toHaveBeenCalledTimes(2);
    });

    it('refetches without sinceSeconds when switching back to All time', async () => {
      const getLogs = vi.fn(() => () => {});
      renderViewer(getLogs);

      await selectSince('Last 15 minutes');
      await waitFor(() => expect(lastOptions(getLogs).sinceSeconds).toBe(900));

      await selectSince('All time');
      await waitFor(() => expect(getLogs).toHaveBeenCalledTimes(3));
      expect(lastOptions(getLogs).sinceSeconds).toBeUndefined();
    });

    it('Reconnect uses the selected window and a later change cancels the reconnected stream', async () => {
      const cancels: Array<ReturnType<typeof vi.fn>> = [];
      const getLogs = vi.fn(() => {
        const cancel = vi.fn();
        cancels.push(cancel);
        return cancel;
      });
      renderViewer(getLogs);

      await selectSince('Last 15 minutes');
      await waitFor(() => expect(getLogs).toHaveBeenCalledTimes(2));

      act(() => {
        lastOptions(getLogs).onReconnectStop();
      });
      fireEvent.click(await screen.findByText('Reconnect'));

      expect(getLogs).toHaveBeenCalledTimes(3);
      expect(lastOptions(getLogs).sinceSeconds).toBe(900);
      // Reconnect cancels the stream that was active before it.
      expect(cancels[1]).toHaveBeenCalledTimes(1);
      expect(cancels[2]).not.toHaveBeenCalled();

      await selectSince('Last 5 minutes');

      await waitFor(() => expect(getLogs).toHaveBeenCalledTimes(4));
      expect(cancels[2]).toHaveBeenCalledTimes(1);
      expect(lastOptions(getLogs).sinceSeconds).toBe(300);
    });

    it('does not restore logs queued for a previous window after switching Since', () => {
      vi.useFakeTimers();
      try {
        const emitters: Array<(batch: { logs: string[]; hasJsonLogs: boolean }) => void> = [];
        const getLogs = vi.fn((_container: string, onLogs: any) => {
          emitters.push(onLogs);
          return () => {};
        });
        renderViewer(getLogs);

        // The first batch is applied right away, the second one waits in the 500 ms debounce.
        act(() => {
          emitters[0]({ logs: ['old line 1\n'], hasJsonLogs: false });
          emitters[0]({ logs: ['old line 1\n', 'old line 2\n'], hasJsonLogs: false });
        });

        // Switch to a window that returns no logs before the debounce fires.
        fireEvent.mouseDown(screen.getByRole('combobox', { name: /Since/ }));
        fireEvent.click(screen.getByRole('option', { name: 'Last 5 minutes' }));
        expect(getLogs).toHaveBeenCalledTimes(2);

        const terminals = vi.mocked(Terminal).mock.results.map(result => result.value);
        terminals.forEach(terminal => terminal.write.mockClear());

        act(() => {
          vi.advanceTimersByTime(1500);
        });

        terminals.forEach(terminal => expect(terminal.write).not.toHaveBeenCalled());
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

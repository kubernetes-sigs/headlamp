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

import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { TestContext } from '../../test';
import { PodLogViewer } from './Details';

vi.mock('../../lib/k8s', () => ({}));
vi.mock('../../lib/k8s/pod', () => ({ default: vi.fn(), __esModule: true }));
vi.mock('../../lib/k8s/cluster', () => ({}));

vi.mock('../globalSearch/useLocalStorageState', () => ({
  useLocalStorageState: (_key: string, defaultValue: any) => [defaultValue, vi.fn()],
}));

const { mockXTermWrite } = vi.hoisted(() => ({ mockXTermWrite: vi.fn() }));

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(function () {
    return {
      open: vi.fn(),
      clear: vi.fn(),
      write: mockXTermWrite,
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

function makeMockPod(getLogs: (...args: any[]) => any, restartCount = 0) {
  return {
    metadata: { name: 'test-pod', namespace: 'default', uid: 'pod-uid-123' },
    spec: {
      containers: [{ name: 'nginx' }, { name: 'sidecar' }],
      initContainers: [],
      ephemeralContainers: [],
    },
    status: {
      containerStatuses: [{ name: 'nginx', state: { running: {} }, restartCount }],
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

  describe('reconnect button', () => {
    it('is cleared when switching to previous logs', () => {
      let capturedOnReconnectStop: (() => void) | undefined;
      const getLogs = vi.fn((_container: string, _onLogs: any, options: any) => {
        capturedOnReconnectStop = options.onReconnectStop;
        return () => {};
      });

      // A restart count above 0 enables the "Previous" switch.
      render(
        <TestContext routerMap={{ namespace: 'default', name: 'test-pod' }}>
          <PodLogViewer open item={makeMockPod(getLogs, 1)} onClose={() => {}} />
        </TestContext>
      );

      // Simulate the current-log stream giving up so the button appears.
      act(() => {
        capturedOnReconnectStop?.();
      });
      expect(screen.getByText('Reconnect')).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Previous'));
      expect(getLogs).toHaveBeenLastCalledWith(
        'nginx',
        expect.any(Function),
        expect.objectContaining({ showPrevious: true })
      );
      expect(screen.queryByText('Reconnect')).not.toBeInTheDocument();
    });

    it('restarts the stream with the current options when Reconnect is clicked', () => {
      let capturedOnReconnectStop: (() => void) | undefined;
      const getLogs = vi.fn((_container: string, _onLogs: any, options: any) => {
        capturedOnReconnectStop = options.onReconnectStop;
        return vi.fn();
      });

      render(
        <TestContext routerMap={{ namespace: 'default', name: 'test-pod' }}>
          <PodLogViewer open item={makeMockPod(getLogs, 1)} onClose={() => {}} />
        </TestContext>
      );

      act(() => {
        capturedOnReconnectStop?.();
      });
      const callsBeforeReconnect = getLogs.mock.calls.length;
      const [, , stoppedOptions] = getLogs.mock.calls[callsBeforeReconnect - 1];
      const cancelStoppedStream = getLogs.mock.results[callsBeforeReconnect - 1].value;

      fireEvent.click(screen.getByText('Reconnect'));

      expect(cancelStoppedStream).toHaveBeenCalledTimes(1);
      expect(getLogs).toHaveBeenCalledTimes(callsBeforeReconnect + 1);
      const [container, , reconnectOptions] = getLogs.mock.lastCall!;
      expect(container).toBe('nginx');
      expect({ ...reconnectOptions, onReconnectStop: undefined }).toEqual({
        ...stoppedOptions,
        onReconnectStop: undefined,
      });
      expect(screen.queryByText('Reconnect')).not.toBeInTheDocument();
    });

    it('stops the reconnected stream when switching to previous logs', () => {
      let capturedOnReconnectStop: (() => void) | undefined;
      const getLogs = vi.fn((_container: string, _onLogs: any, options: any) => {
        capturedOnReconnectStop = options.onReconnectStop;
        return vi.fn();
      });

      render(
        <TestContext routerMap={{ namespace: 'default', name: 'test-pod' }}>
          <PodLogViewer open item={makeMockPod(getLogs, 1)} onClose={() => {}} />
        </TestContext>
      );

      act(() => {
        capturedOnReconnectStop?.();
      });
      fireEvent.click(screen.getByText('Reconnect'));
      const cancelReconnectedStream = getLogs.mock.results.at(-1)!.value;
      expect(cancelReconnectedStream).not.toHaveBeenCalled();

      fireEvent.click(screen.getByLabelText('Previous'));

      expect(cancelReconnectedStream).toHaveBeenCalledTimes(1);
      expect(getLogs).toHaveBeenLastCalledWith(
        'nginx',
        expect.any(Function),
        expect.objectContaining({ showPrevious: true })
      );
      expect(screen.queryByText('Reconnect')).not.toBeInTheDocument();
    });
  });

  describe('stopped stream', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      mockXTermWrite.mockClear();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it.each([
      ['Reconnect is clicked', () => fireEvent.click(screen.getByText('Reconnect'))],
      ['switching to previous logs', () => fireEvent.click(screen.getByLabelText('Previous'))],
    ])('does not write its pending logs after %s', (_name, restartStream) => {
      let capturedOnLogs: ((logs: { logs: string[]; hasJsonLogs: boolean }) => void) | undefined;
      let capturedOnReconnectStop: (() => void) | undefined;
      const getLogs = vi.fn((_container: string, onLogs: any, options: any) => {
        capturedOnLogs = onLogs;
        capturedOnReconnectStop = options.onReconnectStop;
        return vi.fn();
      });

      render(
        <TestContext routerMap={{ namespace: 'default', name: 'test-pod' }}>
          <PodLogViewer open item={makeMockPod(getLogs, 1)} onClose={() => {}} />
        </TestContext>
      );

      // The second batch arrives inside the debounce window, so its write is
      // still pending when the stream closes.
      const stoppedOnLogs = capturedOnLogs!;
      act(() => {
        stoppedOnLogs({ logs: ['old line 1\n'], hasJsonLogs: false });
        stoppedOnLogs({ logs: ['old line 1\n', 'old line 2\n'], hasJsonLogs: false });
        capturedOnReconnectStop?.();
      });

      restartStream();
      mockXTermWrite.mockClear();
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(mockXTermWrite).not.toHaveBeenCalledWith(expect.stringContaining('old line'));
    });
  });
});

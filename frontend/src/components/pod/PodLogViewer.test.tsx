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
  Terminal: vi.fn().mockImplementation(() => ({
    open: vi.fn(),
    clear: vi.fn(),
    write: vi.fn(),
    focus: vi.fn(),
    onData: vi.fn(),
    onResize: vi.fn(),
    attachCustomKeyEventHandler: vi.fn(),
    dispose: vi.fn(),
    loadAddon: vi.fn(),
  })),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: vi.fn(),
    activate: vi.fn(),
  })),
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

  describe('log streaming', () => {
    function getTerminalInstance() {
      const results = (Terminal as unknown as { mock: { results: Array<{ value: any }> } }).mock
        .results;
      return results[results.length - 1]?.value;
    }

    it('writes only newly-appended lines on successive callbacks', () => {
      let logsCb: (arg: { logs: string[]; hasJsonLogs: boolean }) => void = () => {};
      const getLogs = vi.fn((_container: string, cb: typeof logsCb) => {
        logsCb = cb;
        return () => {};
      });

      render(
        <TestContext routerMap={{ namespace: 'default', name: 'test-pod' }}>
          <PodLogViewer open item={makeMockPod(getLogs)} onClose={() => {}} />
        </TestContext>
      );

      const term = getTerminalInstance();
      expect(term).toBeTruthy();
      term.write.mockClear();

      act(() => logsCb({ logs: ['line-a\n'], hasJsonLogs: false }));
      expect(term.write).toHaveBeenLastCalledWith('line-a\r\n');

      act(() => logsCb({ logs: ['line-a\n', 'line-b\n'], hasJsonLogs: false }));
      expect(term.write).toHaveBeenLastCalledWith('line-b\r\n');
      expect(term.write).toHaveBeenCalledTimes(2);
    });

    it('repaints from scratch when the stream resets to the same length', () => {
      let logsCb: (arg: { logs: string[]; hasJsonLogs: boolean }) => void = () => {};
      const getLogs = vi.fn((_container: string, cb: typeof logsCb) => {
        logsCb = cb;
        return () => {};
      });

      render(
        <TestContext routerMap={{ namespace: 'default', name: 'test-pod' }}>
          <PodLogViewer open item={makeMockPod(getLogs)} onClose={() => {}} />
        </TestContext>
      );

      const term = getTerminalInstance();
      term.write.mockClear();
      term.clear.mockClear();

      act(() => logsCb({ logs: ['line-a\n'], hasJsonLogs: false }));
      expect(term.write).toHaveBeenLastCalledWith('line-a\r\n');

      act(() => logsCb({ logs: ['line-z\n'], hasJsonLogs: false }));
      expect(term.clear).toHaveBeenCalled();
      expect(term.write).toHaveBeenLastCalledWith('line-z\r\n');
    });

    it('clears the terminal on reconnect so old logs are not duplicated', () => {
      let logsCb: (arg: { logs: string[]; hasJsonLogs: boolean }) => void = () => {};
      let streamOpts: any = {};
      const getLogs = vi.fn((_container: string, cb: typeof logsCb, opts: any) => {
        logsCb = cb;
        streamOpts = opts;
        return () => {};
      });

      render(
        <TestContext routerMap={{ namespace: 'default', name: 'test-pod' }}>
          <PodLogViewer open item={makeMockPod(getLogs)} onClose={() => {}} />
        </TestContext>
      );

      const term = getTerminalInstance();
      act(() => logsCb({ logs: ['line-a\n', 'line-b\n'], hasJsonLogs: false }));

      act(() => streamOpts.onReconnectStop?.());

      term.clear.mockClear();
      fireEvent.click(screen.getByRole('button', { name: /reconnect/i }));
      expect(term.clear).toHaveBeenCalled();
      expect(getLogs).toHaveBeenCalledTimes(2);
    });
  });
});

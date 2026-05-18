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

import { render } from '@testing-library/react';
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
});

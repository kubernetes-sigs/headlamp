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

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  describe('Previous toggle', () => {
    function makePodWithInitContainer(initRestartCount: number) {
      const pod = makeMockPod(vi.fn(() => () => {}));
      pod.spec.initContainers = [{ name: 'init-db' }];
      pod.status.initContainerStatuses = [
        {
          name: 'init-db',
          state: { waiting: { reason: 'CrashLoopBackOff' } },
          restartCount: initRestartCount,
        },
      ];
      return pod;
    }

    function previousSwitch() {
      return document.querySelector('input[name="checkPrevious"]');
    }

    it('is enabled for an init container that has restarted', () => {
      render(
        <TestContext routerMap={{ namespace: 'default', name: 'test-pod' }}>
          <PodLogViewer
            open
            item={makePodWithInitContainer(3)}
            onClose={() => {}}
            initialContainer="init-db"
          />
        </TestContext>
      );

      expect(previousSwitch()).toBeEnabled();
    });

    it('stays disabled for an init container that has not restarted', () => {
      render(
        <TestContext routerMap={{ namespace: 'default', name: 'test-pod' }}>
          <PodLogViewer
            open
            item={makePodWithInitContainer(0)}
            onClose={() => {}}
            initialContainer="init-db"
          />
        </TestContext>
      );

      expect(previousSwitch()).toBeDisabled();
    });

    it('turns off when switching to a container that has not restarted', async () => {
      const getLogs = vi.fn(() => () => {});
      const pod = makePodWithInitContainer(3);
      pod.getLogs = getLogs;
      render(
        <TestContext routerMap={{ namespace: 'default', name: 'test-pod' }}>
          <PodLogViewer open item={pod} onClose={() => {}} initialContainer="init-db" />
        </TestContext>
      );

      fireEvent.click(previousSwitch()!);
      expect(previousSwitch()).toBeChecked();

      // Pick "nginx" (no restarts) in the container picker
      fireEvent.mouseDown(screen.getByRole('combobox', { name: /Container/ }));
      fireEvent.click(await screen.findByRole('option', { name: 'nginx' }));

      await waitFor(() => expect(previousSwitch()).not.toBeChecked());
      expect(previousSwitch()).toBeDisabled();
      expect(getLogs).toHaveBeenLastCalledWith(
        'nginx',
        expect.any(Function),
        expect.objectContaining({ showPrevious: false })
      );
    });
  });
});

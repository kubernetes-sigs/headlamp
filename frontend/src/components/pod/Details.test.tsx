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

import { act, render } from '@testing-library/react';
import React from 'react';
import { TestContext } from '../../test';

const { mockActivityLaunch, mockDispatchHeadlampEvent } = vi.hoisted(() => ({
  mockActivityLaunch: vi.fn(),
  mockDispatchHeadlampEvent: vi.fn(),
}));

vi.mock('../activity/Activity', () => ({
  Activity: {
    launch: (...args: any[]) => mockActivityLaunch(...args),
    close: vi.fn(),
  },
}));

vi.mock('../../redux/headlampEventSlice', async () => {
  const actual = await vi.importActual<typeof import('../../redux/headlampEventSlice')>(
    '../../redux/headlampEventSlice'
  );

  return {
    ...actual,
    useEventCallback: () => mockDispatchHeadlampEvent,
  };
});
let capturedOnResourceUpdate: ((item: any, error?: any) => void) | undefined;

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    capturedOnResourceUpdate = props.onResourceUpdate;
    return <div data-testid="details-grid" />;
  },
  ConditionsSection: () => null,
  ContainersSection: () => null,
  VolumeSection: () => null,
}));

vi.mock('../common/Terminal', () => ({
  default: () => <div data-testid="mock-terminal" />,
}));

vi.mock('../common/LogViewer', () => ({
  LogViewer: () => <div data-testid="mock-log-viewer" />,
}));

vi.mock('../common/ActionButton', () => ({
  default: () => null,
}));

vi.mock('../common/Link', () => ({
  default: ({ children }: any) => <span>{children}</span>,
}));

vi.mock('../common/SectionBox', () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('../common/SimpleTable', () => ({
  default: () => null,
}));

vi.mock('../common/Tooltip/TooltipLight', () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('../common/Resource/AuthVisible', () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('../../lib/k8s', () => ({}));

vi.mock('../../lib/k8s/pod', () => {
  const Pod = vi.fn();
  return { default: Pod, __esModule: true };
});

vi.mock('../../lib/k8s/cluster', () => ({}));

vi.mock('./List', () => ({
  makePodStatusLabel: () => 'Running',
}));

vi.mock('./PodDebugAction', () => ({
  PodDebugAction: () => null,
}));

vi.mock('../globalSearch/useLocalStorageState', () => ({
  useLocalStorageState: () => [false, vi.fn()],
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn(),
}));

// Must import after mocks are set up
const { default: PodDetails } = await import('./Details');

const mockPod = {
  metadata: {
    name: 'test-pod',
    namespace: 'default',
    uid: 'pod-uid-123',
    creationTimestamp: '2024-01-01T00:00:00Z',
    resourceVersion: '1',
  },
  spec: {
    containers: [{ name: 'nginx', image: 'nginx:latest' }],
    nodeName: 'test-node',
  },
  status: {
    phase: 'Running',
    conditions: [],
    containerStatuses: [
      {
        name: 'nginx',
        state: { running: { startedAt: '2024-01-01T00:00:00Z' } },
        ready: true,
        restartCount: 0,
        image: 'nginx:latest',
        imageID: 'nginx@sha256:abc',
        containerID: 'containerd://abc',
      },
    ],
    hostIP: '10.0.0.1',
    podIP: '10.0.0.2',
  },
  cluster: 'main',
};

function simulatePodLoad() {
  if (capturedOnResourceUpdate) {
    capturedOnResourceUpdate(mockPod);
  }
}

describe('PodDetails auto-launch views', () => {
  beforeEach(() => {
    mockActivityLaunch.mockReset();
    mockDispatchHeadlampEvent.mockReset();
    capturedOnResourceUpdate = undefined;
  });

  it('auto-launches terminal when ?view=exec is present', () => {
    render(
      <TestContext
        routerMap={{ namespace: 'default', name: 'test-pod' }}
        urlPrefix="/c/main/pods"
        urlSearchParams={{ view: 'exec' }}
      >
        <PodDetails name="test-pod" namespace="default" />
      </TestContext>
    );

    act(() => {
      simulatePodLoad();
    });

    expect(mockActivityLaunch).toHaveBeenCalledTimes(1);
    expect(mockActivityLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'terminal-pod-uid-123',
        title: 'test-pod',
      })
    );
  });

  it('auto-launches logs when ?view=logs is present', () => {
    render(
      <TestContext
        routerMap={{ namespace: 'default', name: 'test-pod' }}
        urlPrefix="/c/main/pods"
        urlSearchParams={{ view: 'logs' }}
      >
        <PodDetails name="test-pod" namespace="default" />
      </TestContext>
    );

    act(() => {
      simulatePodLoad();
    });

    expect(mockActivityLaunch).toHaveBeenCalledTimes(1);
    expect(mockActivityLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'logs-pod-uid-123',
      })
    );
  });

  it('does not re-launch logs on subsequent renders for the same pod', () => {
    const { rerender } = render(
      <TestContext
        routerMap={{ namespace: 'default', name: 'test-pod' }}
        urlPrefix="/c/main/pods"
        urlSearchParams={{ view: 'logs' }}
      >
        <PodDetails name="test-pod" namespace="default" />
      </TestContext>
    );

    act(() => {
      simulatePodLoad();
    });
    act(() => {
      rerender(
        <TestContext
          routerMap={{ namespace: 'default', name: 'test-pod' }}
          urlPrefix="/c/main/pods"
          urlSearchParams={{ view: 'logs' }}
        >
          <PodDetails name="test-pod" namespace="default" />
        </TestContext>
      );
      simulatePodLoad();
    });

    expect(mockActivityLaunch).toHaveBeenCalledTimes(1);
  });
  it('does not auto-launch anything when no view param is present', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-pod' }} urlPrefix="/c/main/pods">
        <PodDetails name="test-pod" namespace="default" />
      </TestContext>
    );

    act(() => {
      simulatePodLoad();
    });

    expect(mockActivityLaunch).not.toHaveBeenCalled();
  });

  it('does not auto-launch terminal when view param is something else', () => {
    render(
      <TestContext
        routerMap={{ namespace: 'default', name: 'test-pod' }}
        urlPrefix="/c/main/pods"
        urlSearchParams={{ view: 'other' }}
      >
        <PodDetails name="test-pod" namespace="default" />
      </TestContext>
    );

    act(() => {
      simulatePodLoad();
    });

    expect(mockActivityLaunch).not.toHaveBeenCalled();
  });

  it('does not re-launch terminal on subsequent renders for the same pod', () => {
    render(
      <TestContext
        routerMap={{ namespace: 'default', name: 'test-pod' }}
        urlPrefix="/c/main/pods"
        urlSearchParams={{ view: 'exec' }}
      >
        <PodDetails name="test-pod" namespace="default" />
      </TestContext>
    );

    act(() => {
      simulatePodLoad();
    });
    act(() => {
      simulatePodLoad();
    });

    expect(mockActivityLaunch).toHaveBeenCalledTimes(1);
  });

  it('dispatches TERMINAL event with OPENED status for exec deep-link', () => {
    render(
      <TestContext
        routerMap={{ namespace: 'default', name: 'test-pod' }}
        urlPrefix="/c/main/pods"
        urlSearchParams={{ view: 'exec' }}
      >
        <PodDetails name="test-pod" namespace="default" />
      </TestContext>
    );

    act(() => {
      simulatePodLoad();
    });

    expect(mockDispatchHeadlampEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'headlamp.terminal',
        data: expect.objectContaining({
          status: 'open',
        }),
      })
    );
  });
});

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
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import Deployment from '../../../lib/k8s/deployment';
import Pod from '../../../lib/k8s/pod';
import StatefulSet from '../../../lib/k8s/statefulSet';
import { TestContext } from '../../../test';
import { launchWorkloadLogs, LogsButton } from './LogsButton';

const {
  MockKubeObject,
  mockClusterFetch,
  mockEnqueueSnackbar,
  mockActivityLaunch,
  mockXTermWrite,
  mockXTermClear,
} = vi.hoisted(() => {
  class MockKubeObject {
    jsonData: any;
    static kind = '';
    static apiGroupName = '';
    constructor(data: any) {
      this.jsonData = data;
    }
    get kind() {
      return this.jsonData?.kind;
    }
    static isClassOf(maybeInstance: any) {
      return maybeInstance?.kind === this.kind;
    }
    _class() {
      return this.constructor as any;
    }
    get metadata() {
      return this.jsonData?.metadata;
    }
    get spec() {
      return this.jsonData?.spec;
    }
    get status() {
      return this.jsonData?.status;
    }
    get cluster() {
      return '';
    }
    getName() {
      return this.jsonData?.metadata?.name ?? '';
    }
    getNamespace() {
      return this.jsonData?.metadata?.namespace ?? '';
    }
  }
  return {
    MockKubeObject,
    mockClusterFetch: vi.fn(),
    mockEnqueueSnackbar: vi.fn(),
    mockActivityLaunch: vi.fn(),
    mockXTermWrite: vi.fn(),
    mockXTermClear: vi.fn(),
  };
});

vi.mock('../../../lib/k8s/KubeObject', () => ({ KubeObject: MockKubeObject }));

vi.mock('../../../lib/k8s/deployment', () => {
  class Deployment extends MockKubeObject {
    static kind = 'Deployment';
  }
  return { default: Deployment, __esModule: true };
});

vi.mock('../../../lib/k8s/pod', () => {
  class Pod extends MockKubeObject {
    static kind = 'Pod';
    getLogs() {
      return () => {};
    }
  }
  return { default: Pod, __esModule: true };
});

vi.mock('../../../lib/k8s/daemonSet', () => {
  class DaemonSet extends MockKubeObject {
    static kind = 'DaemonSet';
  }
  return { default: DaemonSet, __esModule: true };
});

vi.mock('../../../lib/k8s/replicaSet', () => {
  class ReplicaSet extends MockKubeObject {
    static kind = 'ReplicaSet';
  }
  return { default: ReplicaSet, __esModule: true };
});

vi.mock('../../../lib/k8s/statefulSet', () => {
  class StatefulSet extends MockKubeObject {
    static kind = 'StatefulSet';
  }
  return { default: StatefulSet, __esModule: true };
});

vi.mock('../../../lib/k8s', () => ({ labelSelectorToQuery: vi.fn(() => 'app=test') }));
vi.mock('../../../lib/k8s/api/v2/fetch', () => ({
  clusterFetch: (...args: any[]) => mockClusterFetch(...args),
}));
vi.mock('notistack', () => ({
  useSnackbar: () => ({ enqueueSnackbar: mockEnqueueSnackbar }),
  SnackbarProvider: ({ children }: any) => children,
}));
vi.mock('../../activity/Activity', () => ({
  Activity: {
    launch: (...args: any[]) => mockActivityLaunch(...args),
    close: vi.fn(),
  },
  ActivitiesRenderer: () => null,
}));
vi.mock('../LogViewer', () => ({
  LogViewer: (props: any) => {
    const { xtermRef } = props;
    React.useEffect(() => {
      if (xtermRef) {
        xtermRef.current = {
          write: mockXTermWrite,
          clear: mockXTermClear,
        };
      }
    }, [xtermRef]);
    return <div data-testid="mock-log-viewer" />;
  },
}));

// Mock Icon to avoid undefined component error
vi.mock('@iconify/react', () => ({
  Icon: () => <span data-testid="icon" />,
}));

// Mock Tooltip components
vi.mock('../Tooltip', () => ({
  LightTooltip: ({ children }: any) => <div>{children}</div>,
}));

const deploymentData = {
  kind: 'Deployment',
  metadata: { name: 'test-deployment', namespace: 'default', uid: 'dep-123' },
  spec: {
    selector: { matchLabels: { app: 'test-app' } },
    template: {
      spec: {
        containers: [{ name: 'nginx', image: 'nginx', imagePullPolicy: 'Always' }],
        nodeName: '',
      },
    },
  },
  status: {},
};

const statefulSetData = {
  kind: 'StatefulSet',
  metadata: { name: 'test-ss', namespace: 'default', uid: 'ss-123' },
  spec: {
    selector: { matchLabels: { app: 'test-app' } },
    template: {
      spec: {
        containers: [{ name: 'nginx', image: 'nginx', imagePullPolicy: 'Always' }],
        nodeName: '',
      },
    },
  },
  status: {},
};

const mockPodData = {
  kind: 'Pod',
  metadata: { name: 'test-pod-1', namespace: 'default', uid: 'pod-123' },
  spec: { containers: [{ name: 'nginx', image: 'nginx', imagePullPolicy: 'Always' }] },
  status: { phase: 'Running', containerStatuses: [{ name: 'nginx', restartCount: 0 }] },
};

describe('LogsButton', () => {
  let originalGetLogs: any;

  beforeEach(() => {
    originalGetLogs = Pod.prototype.getLogs;
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    Pod.prototype.getLogs = originalGetLogs;
  });

  it('renders the logs button for a Deployment', () => {
    render(
      <TestContext>
        <LogsButton item={new Deployment(deploymentData as any)} />
      </TestContext>
    );
    expect(screen.getByLabelText('translation|Show logs')).toBeInTheDocument();
  });

  it('renders the logs button for a StatefulSet', () => {
    render(
      <TestContext>
        <LogsButton item={new StatefulSet(statefulSetData as any)} />
      </TestContext>
    );
    expect(screen.getByLabelText('translation|Show logs')).toBeInTheDocument();
  });

  it('launches activity with correct metadata on click', () => {
    render(
      <TestContext>
        <LogsButton item={new Deployment(deploymentData as any)} />
      </TestContext>
    );
    fireEvent.click(screen.getByLabelText('translation|Show logs'));
    expect(mockActivityLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'logs-dep-123',
        title: 'Logs: test-deployment',
      })
    );
  });

  it('shows warning when no pods found', async () => {
    mockClusterFetch.mockResolvedValue({ json: async () => ({ items: [] }) });
    render(
      <TestContext>
        <LogsButton item={new Deployment(deploymentData as any)} />
      </TestContext>
    );
    fireEvent.click(screen.getByLabelText('translation|Show logs'));
    const activityContent = mockActivityLaunch.mock.calls[0][0].content;
    render(<TestContext>{activityContent}</TestContext>);

    await waitFor(() => {
      expect(mockEnqueueSnackbar).toHaveBeenCalledWith(
        expect.stringMatching(/No pods found/i),
        expect.anything()
      );
    });
  });

  it('streams logs successfully', async () => {
    mockClusterFetch.mockResolvedValue({
      json: async () => ({ items: [mockPodData] }),
    });

    Pod.prototype.getLogs = vi.fn((...args: any[]) => {
      const onLogs = args.find(arg => typeof arg === 'function');
      onLogs({ logs: ['log line 1\n'] });
      return () => {};
    }) as any;

    render(
      <TestContext>
        <LogsButton item={new Deployment(deploymentData as any)} />
      </TestContext>
    );
    fireEvent.click(screen.getByLabelText('translation|Show logs'));
    const activityContent = mockActivityLaunch.mock.calls[0][0].content;
    render(<TestContext>{activityContent}</TestContext>);

    await waitFor(() => {
      expect(mockXTermWrite).toHaveBeenCalledWith(expect.stringContaining('log line 1'));
    });
  });

  it('debounces processAllLogs and batches multiple pod updates', async () => {
    vi.useFakeTimers();
    mockClusterFetch.mockResolvedValue({
      json: async () => ({
        items: [
          { ...mockPodData, metadata: { name: 'pod-1', uid: 'u1' } },
          { ...mockPodData, metadata: { name: 'pod-2', uid: 'u2' } },
        ],
      }),
    });

    let pod1Callback: any;
    let pod2Callback: any;

    Pod.prototype.getLogs = vi.fn(function (this: any, ...args: any[]) {
      const onLogs = args.find(arg => typeof arg === 'function');
      if (this.getName() === 'pod-1') pod1Callback = onLogs;
      if (this.getName() === 'pod-2') pod2Callback = onLogs;
      return () => {};
    }) as any;

    render(
      <TestContext>
        <LogsButton item={new Deployment(deploymentData as any)} />
      </TestContext>
    );
    fireEvent.click(screen.getByLabelText('translation|Show logs'));
    const activityContent = mockActivityLaunch.mock.calls[0][0].content;
    render(<TestContext>{activityContent}</TestContext>);

    await waitFor(() => expect(pod1Callback).toBeDefined());
    await waitFor(() => expect(pod2Callback).toBeDefined());

    // Send updates from both pods
    act(() => {
      pod1Callback({ logs: ['2023-01-01T00:00:01Z pod1 log\n'] });
      pod2Callback({ logs: ['2023-01-01T00:00:02Z pod2 log\n'] });
    });

    // Should not have updated terminal yet due to debounce
    expect(mockXTermWrite).not.toHaveBeenCalled();

    // Advance time by 250ms
    act(() => {
      vi.advanceTimersByTime(250);
    });

    // Now it should be called once with aggregated logs
    expect(mockXTermWrite).toHaveBeenCalledTimes(1);
    const written = mockXTermWrite.mock.calls[0][0];
    expect(written).toContain('[pod-1] 2023-01-01T00:00:01Z pod1 log');
    expect(written).toContain('[pod-2] 2023-01-01T00:00:02Z pod2 log');

    vi.useRealTimers();
  });

  it('cancels timer on unmount', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(global, 'clearTimeout');

    // Mock logs arrival to trigger timer
    mockClusterFetch.mockResolvedValue({
      json: async () => ({ items: [mockPodData] }),
    });

    let onLogsCallback: any;
    Pod.prototype.getLogs = vi.fn((...args: any[]) => {
      const onLogs = args.find(arg => typeof arg === 'function');
      onLogsCallback = onLogs;
      return () => {};
    }) as any;

    render(
      <TestContext>
        <LogsButton item={new Deployment(deploymentData as any)} />
      </TestContext>
    );
    fireEvent.click(screen.getByLabelText('translation|Show logs'));
    const activityContent = mockActivityLaunch.mock.calls[0][0].content;
    const { unmount } = render(<TestContext>{activityContent}</TestContext>);

    await waitFor(() => expect(onLogsCallback).toBeDefined());

    // Trigger logs arrival which starts the debounce timer
    act(() => {
      onLogsCallback({ logs: ['some logs\n'] });
    });

    unmount();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    vi.useRealTimers();
  });

  it('launchWorkloadLogs opens Activity programmatically without a click', () => {
    const dispatchMock = vi.fn();
    launchWorkloadLogs(new Deployment(deploymentData as any) as any, dispatchMock);

    expect(mockActivityLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'logs-dep-123',
        title: 'Logs: test-deployment',
        location: 'full',
      })
    );

    expect(dispatchMock).toHaveBeenCalledWith({
      type: 'headlamp.logs',
      data: {
        status: 'open',
      },
    });
  });

  it('launchWorkloadLogs ignores non-loggable workloads safely (cross-bundle check)', () => {
    class UnknownWorkload extends MockKubeObject {
      static kind = 'Unknown';
    }
    const unknownItem = new UnknownWorkload({
      metadata: { name: 'unknown', uid: 'u-123' },
    });
    const dispatchMock = vi.fn();
    launchWorkloadLogs(unknownItem as any, dispatchMock);

    expect(mockActivityLaunch).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('launchWorkloadLogs works for foreign workloads with loggable kinds (cross-bundle compatibility)', () => {
    class ForeignDeployment extends MockKubeObject {
      static kind = 'Deployment'; // Same kind as a real loggable workload
    }
    const foreignItem = new ForeignDeployment({
      kind: 'Deployment',
      metadata: { name: 'foreign-dep', namespace: 'default', uid: 'foreign-123' },
    });

    const dispatchMock = vi.fn();
    launchWorkloadLogs(foreignItem as any, dispatchMock);

    expect(mockActivityLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'logs-foreign-123',
        title: 'Logs: foreign-dep',
      })
    );
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'headlamp.logs',
      })
    );
  });
});

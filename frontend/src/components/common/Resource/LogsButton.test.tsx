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
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Deployment from '../../../lib/k8s/deployment';
import Pod from '../../../lib/k8s/pod';
import { TestContext } from '../../../test';
import { LogsButton } from './LogsButton';

// vi.hoisted runs before imports, making values available to vi.mock factories
const {
  MockKubeObject,
  mockClusterFetch,
  mockEnqueueSnackbar,
  mockActivityLaunch,
  mockPodUseList,
} = vi.hoisted(() => {
  class MockKubeObject {
    jsonData: any;
    constructor(data: any) {
      this.jsonData = data;
    }
    get kind() {
      return this.jsonData?.kind;
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
    mockPodUseList: vi.fn<(...args: any[]) => any>(() => ({ items: [], isLoading: false })),
  };
});

// --- K8s module mocks ---

vi.mock('../../../lib/k8s/KubeObject', () => ({
  KubeObject: MockKubeObject,
}));

vi.mock('../../../lib/k8s/deployment', () => ({
  default: class Deployment extends MockKubeObject {},
  __esModule: true,
}));

vi.mock('../../../lib/k8s/pod', () => {
  class Pod extends MockKubeObject {
    getLogs() {
      return () => {};
    }
    static useList(...args: any[]) {
      return mockPodUseList(...args);
    }
  }
  return { default: Pod, __esModule: true };
});

vi.mock('../../../lib/k8s/daemonSet', () => ({
  default: class DaemonSet extends MockKubeObject {},
  __esModule: true,
}));

vi.mock('../../../lib/k8s/replicaSet', () => ({
  default: class ReplicaSet extends MockKubeObject {},
  __esModule: true,
}));

vi.mock('../../../lib/k8s', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../lib/k8s')>();
  return {
    ...actual,
  };
});

vi.mock('../../../lib/k8s/api/v2/fetch', () => ({
  clusterFetch: (...args: any[]) => mockClusterFetch(...args),
}));

vi.mock('notistack', () => ({
  useSnackbar: () => ({ enqueueSnackbar: mockEnqueueSnackbar }),
}));

vi.mock('../../activity/Activity', () => ({
  Activity: {
    launch: (...args: any[]) => mockActivityLaunch(...args),
    close: vi.fn(),
  },
  ActivitiesRenderer: () => null,
}));

// --- Mock Data ---

const deploymentData = {
  kind: 'Deployment',
  metadata: {
    name: 'test-deployment',
    namespace: 'default',
    creationTimestamp: '2024-01-01T00:00:00Z',
    uid: 'dep-123',
  },
  spec: {
    selector: { matchLabels: { app: 'test-app' } },
    template: {
      spec: {
        nodeName: 'test-node',
        containers: [{ name: 'nginx', image: 'nginx:latest', imagePullPolicy: 'Always' }],
      },
    },
  },
  status: {},
};

const mockPodData = {
  kind: 'Pod',
  apiVersion: 'v1',
  metadata: {
    name: 'test-pod-1',
    namespace: 'default',
    creationTimestamp: '2024-01-01T00:00:00Z',
    uid: 'pod-123',
  },
  spec: {
    containers: [{ name: 'nginx', image: 'nginx:latest', imagePullPolicy: 'Always' }],
    nodeName: 'test-node',
  },
  status: { phase: 'Running' },
};

// --- Tests ---

describe('LogsButton', () => {
  let originalGetLogs: typeof Pod.prototype.getLogs;

  beforeEach(() => {
    originalGetLogs = Pod.prototype.getLogs;
    mockClusterFetch.mockReset();
    mockEnqueueSnackbar.mockReset();
    mockActivityLaunch.mockReset();
    mockPodUseList.mockReset();
    mockPodUseList.mockReturnValue({ items: [], isLoading: false });
  });

  afterEach(() => {
    Pod.prototype.getLogs = originalGetLogs;
  });

  it('renders the logs button for a Deployment', () => {
    render(
      <TestContext>
        <LogsButton item={new Deployment(deploymentData)} />
      </TestContext>
    );

    expect(screen.getByLabelText('translation|Show logs')).toBeInTheDocument();
  });

  it('does not render the button for null item', () => {
    render(
      <TestContext>
        <LogsButton item={null} />
      </TestContext>
    );

    expect(screen.queryByLabelText('Show logs')).not.toBeInTheDocument();
  });

  it('launches Activity with correct metadata on click', () => {
    render(
      <TestContext>
        <LogsButton item={new Deployment(deploymentData)} />
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

  it('renders log viewer with empty logs when no pods are available', async () => {
    mockPodUseList.mockReturnValue({ items: [], isLoading: false });

    const { rerender } = render(
      <TestContext>
        <LogsButton item={new Deployment(deploymentData)} />
      </TestContext>
    );

    fireEvent.click(screen.getByLabelText('translation|Show logs'));

    const activityContent = mockActivityLaunch.mock.calls[0][0].content;
    rerender(
      <TestContext>
        <div id="main" />
        {activityContent}
      </TestContext>
    );

    await waitFor(() => {
      expect(mockPodUseList).toHaveBeenCalled();
    });
  });

  it('opens log viewer in loading state when pods are loading', async () => {
    mockPodUseList.mockReturnValue({ items: null as any, isLoading: true });

    const { rerender } = render(
      <TestContext>
        <LogsButton item={new Deployment(deploymentData)} />
      </TestContext>
    );

    fireEvent.click(screen.getByLabelText('translation|Show logs'));

    const activityContent = mockActivityLaunch.mock.calls[0][0].content;
    rerender(
      <TestContext>
        <div id="main" />
        {activityContent}
      </TestContext>
    );

    await waitFor(() => {
      expect(mockPodUseList).toHaveBeenCalledWith(
        expect.objectContaining({ labelSelector: 'app=test-app' })
      );
    });
  });

  it('fetches logs for pods returned by useList', async () => {
    const mockPod = new Pod(mockPodData as any);
    mockPodUseList.mockReturnValue({ items: [mockPod] as any, isLoading: false });

    mockClusterFetch.mockResolvedValue({
      body: new ReadableStream({
        start(c) {
          c.close();
        },
      }),
    });

    const { rerender } = render(
      <TestContext>
        <LogsButton item={new Deployment(deploymentData)} />
      </TestContext>
    );

    fireEvent.click(screen.getByLabelText('translation|Show logs'));

    const activityContent = mockActivityLaunch.mock.calls[0][0].content;
    rerender(
      <TestContext>
        <div id="main" />
        {activityContent}
      </TestContext>
    );

    await waitFor(() => {
      expect(mockClusterFetch).toHaveBeenCalledWith(
        expect.stringContaining('/pods/test-pod-1/log'),
        expect.objectContaining({ cluster: '' })
      );
    });
  });
});

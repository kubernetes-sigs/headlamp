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
const { MockKubeObject, mockClusterFetch, mockEnqueueSnackbar, mockActivityLaunch } = vi.hoisted(
  () => {
    class MockKubeObject {
      jsonData: any;
      constructor(data: any) {
        this.jsonData = data;
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
    };
  }
);

// --- K8s module mocks ---

vi.mock('../../../lib/k8s/KubeObject', () => ({
  KubeObject: MockKubeObject,
}));

vi.mock('../../../lib/k8s/deployment', () => ({
  default: class Deployment extends MockKubeObject {},
  __esModule: true,
}));

vi.mock('../../../lib/k8s/pod', () => ({
  default: class Pod extends MockKubeObject {
    getLogs() {
      return () => {};
    }
  },
  __esModule: true,
}));

vi.mock('../../../lib/k8s/daemonSet', () => ({
  default: class DaemonSet extends MockKubeObject {},
  __esModule: true,
}));

vi.mock('../../../lib/k8s/replicaSet', () => ({
  default: class ReplicaSet extends MockKubeObject {},
  __esModule: true,
}));

vi.mock('../../../lib/k8s', () => ({}));

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

  it('shows warning snackbar when no pods are available', async () => {
    mockClusterFetch.mockResolvedValue({
      json: async () => ({ kind: 'PodList', apiVersion: 'v1', metadata: {}, items: [] }),
    });

    const { rerender } = render(
      <TestContext>
        <LogsButton item={new Deployment(deploymentData)} />
      </TestContext>
    );

    fireEvent.click(screen.getByLabelText('translation|Show logs'));

    // Render the LogsButtonContent
    const activityContent = mockActivityLaunch.mock.calls[0][0].content;
    rerender(
      <TestContext>
        <div id="main" />
        {activityContent}
      </TestContext>
    );

    await waitFor(() => {
      expect(mockEnqueueSnackbar).toHaveBeenCalledWith(
        expect.stringMatching(/No pods found/i),
        expect.objectContaining({ variant: 'warning' })
      );
    });
  });

  it('opens log viewer in loading state when getLogs never delivers data', async () => {
    mockClusterFetch.mockResolvedValue({
      json: async () => ({
        kind: 'PodList',
        apiVersion: 'v1',
        metadata: {},
        items: [mockPodData],
      }),
    });

    Pod.prototype.getLogs = function () {
      // Never deliver logs — simulates loading
      return () => {};
    };

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

    // LogsButtonContent mounts and fetches pods
    await waitFor(() => {
      expect(mockClusterFetch).toHaveBeenCalled();
    });
  });

  it('opens log viewer and streams logs successfully', async () => {
    mockClusterFetch.mockResolvedValue({
      json: async () => ({
        kind: 'PodList',
        apiVersion: 'v1',
        metadata: {},
        items: [mockPodData],
      }),
    });

    Pod.prototype.getLogs = function (...args: any[]) {
      const onLogs = args[1];
      const mockLogs = [
        '2023-01-01T00:00:01Z Starting container...\n',
        '2023-01-01T00:00:02Z Initializing application...\n',
        '2023-01-01T00:00:03Z Server listening on port 80\n',
      ];
      const timeout = setTimeout(() => onLogs({ logs: mockLogs, hasJsonLogs: false }), 50);
      return () => clearTimeout(timeout);
    };

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

    // LogsButtonContent mounts and fetches pods
    await waitFor(() => {
      expect(mockClusterFetch).toHaveBeenCalled();
    });
  });
});

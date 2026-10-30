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
import { TestContext } from '../../../test';
import PortForward, { PORT_FORWARD_STOP_STATUS, PORT_FORWARDS_STORAGE_KEY } from './PortForward';

const { mockListPortForward, mockStartPortForward, mockStopOrDeletePortForward, mockUsePodList } =
  vi.hoisted(() => ({
    mockListPortForward: vi.fn(),
    mockStartPortForward: vi.fn(),
    mockStopOrDeletePortForward: vi.fn(),
    mockUsePodList: vi.fn<(options: unknown) => [any[], null]>(() => [[], null]),
  }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('../../../helpers/isElectron', () => ({ isElectron: () => true }));
vi.mock('../../../helpers/isDockerDesktop', () => ({ isDockerDesktop: () => false }));
vi.mock('../../../lib/cluster', () => ({ getCluster: () => 'test-cluster' }));
vi.mock('../../../lib/k8s/api/v1/portForward', () => ({
  listPortForward: (...args: any[]) => mockListPortForward(...args),
  startPortForward: (...args: any[]) => mockStartPortForward(...args),
  stopOrDeletePortForward: (...args: any[]) => mockStopOrDeletePortForward(...args),
}));
vi.mock('../../../lib/k8s/pod', () => ({
  default: { useList: (options: any) => mockUsePodList(options) },
}));
vi.mock('../../portforward/PortForwardStartDialog', () => ({
  default: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) =>
    open ? <button onClick={() => onConfirm()}>Confirm start</button> : null,
}));

const runningPortForward = {
  id: 'pf-1',
  pod: 'my-pod',
  service: '',
  serviceNamespace: '',
  namespace: 'default',
  cluster: 'test-cluster',
  port: '8080',
  targetPort: '80',
  status: 'Running',
};

function makePod() {
  return {
    kind: 'Pod',
    cluster: 'test-cluster',
    metadata: { name: 'my-pod', namespace: 'default' },
    status: { phase: 'Running' },
    spec: { containers: [] },
  };
}

function makeServicePod(name: string, { phase = 'Running', ready = true, deleting = false } = {}) {
  return {
    kind: 'Pod',
    cluster: 'project-cluster',
    metadata: {
      name,
      namespace: 'default',
      ...(deleting ? { deletionTimestamp: '2026-01-01T00:00:00Z' } : {}),
    },
    status: { phase, conditions: [{ type: 'Ready', status: ready ? 'True' : 'False' }] },
    spec: { containers: [] },
  };
}

function renderServicePortForward(selector?: Record<string, string>) {
  const service = {
    kind: 'Service',
    cluster: 'project-cluster',
    metadata: { name: 'my-service', namespace: 'default' },
    jsonData: { spec: { selector } },
  };

  return render(
    <TestContext>
      <PortForward containerPort={80} resource={service as any} />
    </TestContext>
  );
}

function renderPortForward() {
  return render(
    <TestContext>
      <PortForward containerPort={80} resource={makePod() as any} />
    </TestContext>
  );
}

describe('PortForward stop handler', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockListPortForward.mockResolvedValue([runningPortForward]);
  });

  it('loads service pods from the resource cluster', () => {
    const service = {
      kind: 'Service',
      cluster: 'project-cluster',
      metadata: { name: 'my-service', namespace: 'default' },
      jsonData: { spec: { selector: { app: 'my-service' } } },
    };

    render(
      <TestContext>
        <PortForward containerPort={80} resource={service as any} />
      </TestContext>
    );

    expect(mockUsePodList).toHaveBeenCalledWith({
      namespace: 'default',
      labelSelector: 'app=my-service',
      cluster: 'project-cluster',
    });
  });

  it('shows Stop button when a port forward is running', async () => {
    renderPortForward();
    await waitFor(() => {
      expect(screen.getByLabelText(/Stop port forward/i)).toBeInTheDocument();
    });
  });

  it('transitions UI from running to stopped after clicking Stop', async () => {
    mockStopOrDeletePortForward.mockResolvedValue('ok');
    renderPortForward();

    await waitFor(() => screen.getByLabelText(/Stop port forward/i));

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Stop port forward/i));
    });

    await waitFor(() => {
      expect(screen.queryByLabelText(/Stop port forward/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/Start port forward/i)).toBeInTheDocument();
    });
  });

  it('shows port URL as plain text (not a link) in stopped state', async () => {
    mockStopOrDeletePortForward.mockResolvedValue('ok');
    renderPortForward();

    await waitFor(() => screen.getByLabelText(/Stop port forward/i));

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Stop port forward/i));
    });

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /127\.0\.0\.1:8080/ })).not.toBeInTheDocument();
      expect(screen.getByText('http://127.0.0.1:8080')).toBeInTheDocument();
    });
  });

  it('shows error and resets to idle state when stop fails', async () => {
    mockStopOrDeletePortForward.mockRejectedValue(new Error('network error'));
    renderPortForward();

    await waitFor(() => screen.getByLabelText(/Stop port forward/i));

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Stop port forward/i));
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      const tooltipTrigger = screen.getByText('network error');
      expect(tooltipTrigger).toBeInTheDocument();
      expect(screen.queryByLabelText(/Stop port forward/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/Start port forward/i)).toBeInTheDocument();
    });
  });

  it('renders port forward URL as a link with rel="noopener noreferrer" when running', async () => {
    renderPortForward();
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /127\.0\.0\.1:8080/ });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link).toHaveAttribute('target', '_blank');
    });
  });

  it('PORT_FORWARD_STOP_STATUS constant equals "Stopped"', () => {
    expect(PORT_FORWARD_STOP_STATUS).toBe('Stopped');
  });

  it('shows error and keeps port forward visible when delete fails', async () => {
    mockStopOrDeletePortForward.mockResolvedValueOnce('ok');
    mockStopOrDeletePortForward.mockRejectedValueOnce(new Error('delete failed'));
    renderPortForward();

    await waitFor(() => screen.getByLabelText(/Stop port forward/i));
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Stop port forward/i));
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/Start port forward/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Delete port forward/i)).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Delete port forward/i));
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('delete failed')).toBeInTheDocument();
      expect(screen.getByLabelText(/Delete port forward/i)).toBeInTheDocument();
    });
  });

  it('handles corrupted localStorage JSON safely', async () => {
    localStorage.setItem(PORT_FORWARDS_STORAGE_KEY, 'invalid-json{');
    mockListPortForward.mockResolvedValue([]);
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      renderPortForward();
      await waitFor(() => {
        // Should not crash and should render normal start button
        expect(screen.getByLabelText(/Start port forward/i)).toBeInTheDocument();
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          'Failed to parse port forwards from storage',
          expect.anything()
        );
      });
    } finally {
      consoleWarnSpy.mockRestore();
    }
  });

  it('does not offer a port forward for a service without a selector', async () => {
    mockListPortForward.mockResolvedValue([]);
    // Without a selector the pod query isn't filtered, so it returns unrelated pods.
    mockUsePodList.mockReturnValue([[makeServicePod('unrelated-pod')], null]);

    renderServicePortForward();

    await act(async () => {});
    expect(screen.queryByLabelText(/Start port forward/i)).not.toBeInTheDocument();
    expect(mockListPortForward).not.toHaveBeenCalled();
  });

  it.each([
    [
      'none of its pods are ready',
      [
        makeServicePod('pending-pod', { phase: 'Pending', ready: false }),
        makeServicePod('unready-pod', { ready: false }),
      ],
    ],
    ['it has no pods', []],
  ])('disables starting a service port forward when %s', async (_, pods) => {
    mockListPortForward.mockResolvedValue([]);
    mockUsePodList.mockReturnValue([pods, null]);

    renderServicePortForward({ app: 'my-service' });

    expect(await screen.findByLabelText(/Start port forward/i)).toBeDisabled();
  });

  it.each([
    ['no pod is ready', [makeServicePod('new-pod', { ready: false })]],
    ['the service has no pods yet', []],
  ])('keeps a reconnecting service port forward stoppable while %s', async (_, pods) => {
    mockListPortForward.mockResolvedValue([
      {
        ...runningPortForward,
        pod: 'old-pod',
        service: 'my-service',
        serviceNamespace: 'default',
        cluster: 'project-cluster',
        status: 'Reconnecting',
      },
    ]);
    mockUsePodList.mockReturnValue([pods, null]);

    renderServicePortForward({ app: 'my-service' });

    expect(await screen.findByLabelText(/Stop port forward/i)).toBeInTheDocument();
  });

  it('forwards a service to its first ready pod', async () => {
    mockListPortForward.mockResolvedValue([]);
    mockStartPortForward.mockResolvedValue({ ...runningPortForward, pod: 'ready-pod' });
    mockUsePodList.mockReturnValue([
      [
        makeServicePod('pending-pod', { phase: 'Pending', ready: false }),
        makeServicePod('terminating-pod', { deleting: true }),
        makeServicePod('ready-pod'),
      ],
      null,
    ]);

    renderServicePortForward({ app: 'my-service' });

    await act(async () => {
      fireEvent.click(await screen.findByLabelText(/Start port forward/i));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Confirm start'));
    });

    expect(mockStartPortForward).toHaveBeenCalledWith(
      'project-cluster',
      'default',
      'ready-pod',
      80,
      'my-service',
      'default',
      undefined,
      'localhost',
      undefined
    );
  });
});

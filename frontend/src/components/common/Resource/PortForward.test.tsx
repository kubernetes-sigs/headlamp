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
import { ApiError } from '../../../lib/k8s/api/v2/ApiError';
import { getDiscoveredConnectionRevision } from '../../../lib/k8s/api/v2/discoveredConnectionRevisions';
import { recordDiscoveryConnection } from '../../../lib/k8s/api/v2/discoveryConnection';
import { KubePod } from '../../../lib/k8s/pod';
import { setConfig } from '../../../redux/configSlice';
import appStore from '../../../redux/stores/store';
import { TestContext } from '../../../test';
import PortForward, { PORT_FORWARD_STOP_STATUS, PORT_FORWARDS_STORAGE_KEY } from './PortForward';

const {
  mockListPortForward,
  mockStartPortForward,
  mockStopOrDeletePortForward,
  mockUsePodList,
  mockIsElectron,
  mockIsDockerDesktop,
} = vi.hoisted(() => ({
  mockListPortForward: vi.fn(),
  mockStartPortForward: vi.fn(),
  mockStopOrDeletePortForward: vi.fn(),
  mockUsePodList: vi.fn<(options: unknown) => [KubePod[] | null, ApiError | null]>(() => [
    [],
    null,
  ]),
  mockIsElectron: vi.fn(() => true),
  mockIsDockerDesktop: vi.fn(() => false),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('../../../helpers/isElectron', () => ({ isElectron: mockIsElectron }));
vi.mock('../../../helpers/isDockerDesktop', () => ({ isDockerDesktop: mockIsDockerDesktop }));
vi.mock('../../../lib/cluster', () => ({ getCluster: () => 'test-cluster' }));
vi.mock('../../../lib/k8s/api/v1/portForward', async importOriginal => ({
  ...(await importOriginal<object>()),
  listPortForward: mockListPortForward,
  startPortForwardForConnection: mockStartPortForward,
  stopOrDeletePortForward: mockStopOrDeletePortForward,
}));
vi.mock('../../../lib/k8s/pod', () => ({
  default: { useList: mockUsePodList },
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

function makePod(): KubePod {
  return {
    kind: 'Pod',
    cluster: 'test-cluster',
    metadata: {
      name: 'my-pod',
      namespace: 'default',
      uid: 'pod-1',
      creationTimestamp: '2025-01-01T00:00:00Z',
    },
    status: { phase: 'Running', conditions: [], containerStatuses: [], startTime: '' },
    spec: { containers: [], nodeName: 'node-1' },
  };
}

function renderPortForward() {
  return render(
    <TestContext>
      <PortForward containerPort={80} resource={makePod()} />
    </TestContext>
  );
}

describe('PortForward stop handler', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockUsePodList.mockReturnValue([[], null]);
    mockIsElectron.mockReturnValue(true);
    mockIsDockerDesktop.mockReturnValue(false);
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

  it('starts a new forward using the selected local port and persists the server result', async () => {
    mockListPortForward.mockResolvedValue([]);
    mockStartPortForward.mockResolvedValue(runningPortForward);
    renderPortForward();
    await waitFor(() => expect(mockListPortForward).toHaveBeenCalled());

    fireEvent.click(screen.getByLabelText(/Start port forward/i));
    expect(screen.getByRole('dialog')).toHaveTextContent('my-pod (default)');
    fireEvent.change(screen.getByLabelText('translation|Local Port'), {
      target: { value: '8080' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'translation|Start' }));

    await screen.findByRole('link', { name: 'http://127.0.0.1:8080' });
    expect(mockStartPortForward).toHaveBeenCalledWith(
      { cluster: 'test-cluster', revision: undefined },
      {
        id: '',
        namespace: 'default',
        pod: 'my-pod',
        targetPort: '80',
        service: '',
        serviceNamespace: 'default',
        port: '8080',
        address: 'localhost',
      }
    );
    expect(JSON.parse(localStorage.getItem(PORT_FORWARDS_STORAGE_KEY)!)).toEqual([
      runningPortForward,
    ]);
  });

  function selectPortForwardConnection(revision: string) {
    const cluster = 'discovered-forward';
    const previous = appStore.getState().config.clusters;
    appStore.dispatch(
      setConfig({
        clusters: {
          ...previous,
          [cluster]: {
            name: cluster,
            auth_type: 'oidc',
            server: 'https://proxy.example.test',
            meta_data: {
              discoveryConnectionRevision: revision,
              discoveryOrigin: {
                cluster: 'management',
                resource: {
                  apiVersion: 'fleet.example.test/v1',
                  kind: 'Cluster',
                  namespace: 'default',
                  name: cluster,
                  uid: revision,
                },
              },
            },
          },
        },
      })
    );
    const pod = makePod();
    pod.cluster = cluster;
    recordDiscoveryConnection(pod, cluster, getDiscoveredConnectionRevision(cluster));
    return pod;
  }

  const renderResource = (pod: KubePod, containerPort: number | string = 80) => (
    <TestContext>
      <PortForward containerPort={containerPort} resource={pod} />
    </TestContext>
  );

  it('rejects confirmation for a pod from a replaced connection', async () => {
    const previous = appStore.getState().config.clusters;
    mockListPortForward.mockResolvedValue([]);
    const { rerender, unmount } = render(renderResource(selectPortForwardConnection('original')));
    try {
      fireEvent.click(await screen.findByLabelText(/start port forward/i));
      act(() => rerender(renderResource(selectPortForwardConnection('replacement'))));
      fireEvent.click(screen.getByRole('button', { name: 'translation|Start' }));
      expect(mockStartPortForward).not.toHaveBeenCalled();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Discovered cluster connection changed'
      );
    } finally {
      unmount();
      appStore.dispatch(setConfig({ clusters: previous }));
    }
  });

  it.each(['stop', 'delete'] as const)(
    'keeps the replacement start pending after a late %s',
    async action => {
      const previous = appStore.getState().config.clusters;
      const original = {
        ...runningPortForward,
        cluster: 'discovered-forward',
        connectionRevision: 'original',
        status: action === 'stop' ? runningPortForward.status : PORT_FORWARD_STOP_STATUS,
      };
      const replacement = {
        ...original,
        id: 'replacement-id',
        port: '8081',
        connectionRevision: 'replacement',
        status: runningPortForward.status,
      };
      const oldAction = Promise.withResolvers<string>();
      const newStart = Promise.withResolvers<typeof replacement>();
      mockListPortForward.mockResolvedValueOnce([original]).mockResolvedValue([]);
      mockStopOrDeletePortForward.mockReturnValueOnce(oldAction.promise);
      mockStartPortForward.mockReturnValueOnce(newStart.promise);
      const { rerender, unmount } = render(renderResource(selectPortForwardConnection('original')));
      try {
        fireEvent.click(await screen.findByLabelText(new RegExp(`${action} port forward`, 'i')));
        expect(mockStopOrDeletePortForward).toHaveBeenCalledWith(
          original.cluster,
          original.id,
          action === 'stop'
        );

        await act(async () => rerender(renderResource(selectPortForwardConnection('replacement'))));
        fireEvent.click(await screen.findByLabelText(/start port forward/i));
        fireEvent.click(await screen.findByRole('button', { name: 'translation|Start' }));
        expect(await screen.findByRole('progressbar')).toBeInTheDocument();
        if (action === 'delete') {
          localStorage.setItem(PORT_FORWARDS_STORAGE_KEY, JSON.stringify([original, replacement]));
        }

        await act(async () => oldAction.resolve('ok'));
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        if (action === 'delete') {
          expect(JSON.parse(localStorage.getItem(PORT_FORWARDS_STORAGE_KEY)!)).toEqual([
            replacement,
          ]);
        }

        await act(async () => newStart.resolve(replacement));
        expect(
          await screen.findByRole('link', { name: 'http://127.0.0.1:8081' })
        ).toBeInTheDocument();
      } finally {
        unmount();
        appStore.dispatch(setConfig({ clusters: previous }));
      }
    }
  );

  it.each(['Stop', 'Delete'] as const)(
    'does not expose the replacement %s control on a retained Pod',
    async action => {
      const previous = appStore.getState().config.clusters;
      const original = selectPortForwardConnection('original');
      const forward = {
        ...runningPortForward,
        cluster: original.cluster,
        connectionRevision: 'original',
        status: action === 'Stop' ? runningPortForward.status : PORT_FORWARD_STOP_STATUS,
      };
      mockListPortForward
        .mockResolvedValueOnce([forward])
        .mockResolvedValue([
          { ...forward, id: 'replacement-id', connectionRevision: 'replacement' },
        ]);
      const { unmount } = render(renderResource(original));
      try {
        const control = new RegExp(`${action} port forward`, 'i');
        await screen.findByLabelText(control);
        await act(async () => {
          selectPortForwardConnection('replacement');
        });

        expect(screen.queryByLabelText(control)).not.toBeInTheDocument();
        expect(mockListPortForward).toHaveBeenCalledOnce();
        expect(mockStopOrDeletePortForward).not.toHaveBeenCalled();
      } finally {
        unmount();
        appStore.dispatch(setConfig({ clusters: previous }));
      }
    }
  );

  it('does not display original sessions for a same-named replacement pod', async () => {
    const previous = appStore.getState().config.clusters;
    const oldForward = {
      ...runningPortForward,
      cluster: 'discovered-forward',
      connectionRevision: 'original',
    };
    const lateStart = Promise.withResolvers<typeof oldForward>();
    mockListPortForward.mockResolvedValueOnce([]).mockResolvedValue([oldForward]);
    mockStartPortForward.mockReturnValue(lateStart.promise);
    const { rerender, unmount } = render(renderResource(selectPortForwardConnection('original')));
    try {
      fireEvent.click(await screen.findByLabelText(/start port forward/i));
      fireEvent.click(screen.getByRole('button', { name: 'translation|Start' }));
      expect(mockStartPortForward).toHaveBeenCalledOnce();
      act(() => rerender(renderResource(selectPortForwardConnection('replacement'))));
      await act(async () => lateStart.resolve(oldForward));
      expect(screen.queryByRole('link', { name: 'http://127.0.0.1:8080' })).not.toBeInTheDocument();
      expect(
        await screen.findByRole('button', { name: 'translation|Start port forward' })
      ).toBeEnabled();
    } finally {
      unmount();
      appStore.dispatch(setConfig({ clusters: previous }));
    }
  });

  it('clears a pending start when the retained pod loses its connection', async () => {
    const previous = appStore.getState().config.clusters;
    const original = selectPortForwardConnection('original');
    const forward = {
      ...runningPortForward,
      cluster: original.cluster,
      connectionRevision: 'original',
    };
    const pendingStart = Promise.withResolvers<typeof forward>();
    mockListPortForward.mockResolvedValue([]);
    mockStartPortForward.mockReturnValueOnce(pendingStart.promise);
    const { unmount } = render(renderResource(original));
    try {
      fireEvent.click(await screen.findByLabelText(/start port forward/i));
      fireEvent.click(screen.getByRole('button', { name: 'translation|Start' }));
      expect(await screen.findByRole('progressbar')).toBeInTheDocument();

      await act(async () => {
        selectPortForwardConnection('replacement');
      });
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      await act(async () => pendingStart.resolve(forward));
      expect(screen.queryByRole('link', { name: 'http://127.0.0.1:8080' })).not.toBeInTheDocument();
    } finally {
      unmount();
      appStore.dispatch(setConfig({ clusters: previous }));
    }
  });

  it('uses a named port from the supplied pod even when it cannot list pods', async () => {
    const pod = makePod();
    pod.spec.containers = [
      {
        name: 'web',
        image: 'web',
        imagePullPolicy: 'IfNotPresent',
        ports: [{ name: 'http', containerPort: 8081 }],
      },
    ];
    mockUsePodList.mockReturnValue([null, new ApiError('Cannot list pods', { status: 403 })]);
    mockListPortForward.mockResolvedValue([]);
    mockStartPortForward.mockResolvedValue(runningPortForward);
    render(renderResource(pod, 'http'));
    fireEvent.click(await screen.findByLabelText(/start port forward/i));
    fireEvent.click(screen.getByRole('button', { name: 'translation|Start' }));
    expect(mockUsePodList).toHaveBeenCalledWith(expect.objectContaining({ clusters: [] }));
    expect(mockStartPortForward).toHaveBeenCalledWith(
      { cluster: 'test-cluster', revision: undefined },
      expect.objectContaining({ pod: 'my-pod', targetPort: '8081' })
    );
    await screen.findByRole('link', { name: 'http://127.0.0.1:8080' });
  });

  it('cancels the start dialog without contacting the backend', async () => {
    mockListPortForward.mockResolvedValue([]);
    renderPortForward();
    await waitFor(() => expect(mockListPortForward).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText(/Start port forward/i));
    fireEvent.click(screen.getByRole('button', { name: 'translation|Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockStartPortForward).not.toHaveBeenCalled();
  });

  it('merges missing saved forwards as stopped, filters malformed entries, and deletes only the selected entry', async () => {
    const saved = { ...runningPortForward, id: 'saved' };
    const unrelated = { ...runningPortForward, id: 'other', pod: 'other-pod' };
    localStorage.setItem(
      PORT_FORWARDS_STORAGE_KEY,
      JSON.stringify([null, [], { id: 123 }, saved, unrelated])
    );
    mockListPortForward.mockResolvedValue([]);
    mockStopOrDeletePortForward.mockResolvedValue('ok');
    renderPortForward();

    fireEvent.click(await screen.findByLabelText(/Delete port forward/i));
    await waitFor(() =>
      expect(screen.queryByLabelText(/Delete port forward/i)).not.toBeInTheDocument()
    );
    expect(mockStopOrDeletePortForward).toHaveBeenCalledWith('test-cluster', 'saved', false);
    expect(JSON.parse(localStorage.getItem(PORT_FORWARDS_STORAGE_KEY)!)).toEqual([
      { ...unrelated, status: 'Stopped' },
    ]);
    expect(screen.getByLabelText(/Start port forward/i)).toBeInTheDocument();
  });

  it('does not duplicate a saved forward already returned by the server', async () => {
    localStorage.setItem(PORT_FORWARDS_STORAGE_KEY, JSON.stringify([runningPortForward]));
    renderPortForward();
    await screen.findByLabelText(/Stop port forward/i);
    expect(JSON.parse(localStorage.getItem(PORT_FORWARDS_STORAGE_KEY)!)).toEqual([
      runningPortForward,
    ]);
  });

  it('removes a stale saved forward after restarting it fails and permits dismissing the error', async () => {
    localStorage.setItem(PORT_FORWARDS_STORAGE_KEY, JSON.stringify([runningPortForward]));
    mockListPortForward.mockResolvedValue([]);
    mockStartPortForward.mockRejectedValue({ message: 'port is occupied' });
    renderPortForward();
    await screen.findByLabelText(/Delete port forward/i);
    fireEvent.click(screen.getByLabelText(/Start port forward/i));
    fireEvent.click(screen.getByRole('button', { name: 'translation|Start' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('port is occupied');
    expect(mockStartPortForward).toHaveBeenCalledWith(
      { cluster: 'test-cluster', revision: undefined },
      {
        id: 'pf-1',
        namespace: 'default',
        pod: 'my-pod',
        targetPort: '80',
        service: '',
        serviceNamespace: 'default',
        port: '8080',
        address: 'localhost',
      }
    );
    expect(JSON.parse(localStorage.getItem(PORT_FORWARDS_STORAGE_KEY)!)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    [undefined, 'An unexpected error occurred.'],
    ['backend unavailable', 'backend unavailable'],
  ])('shows a useful start error for %s rejections', async (failure, message) => {
    mockListPortForward.mockResolvedValue([]);
    mockStartPortForward.mockRejectedValue(failure);
    renderPortForward();
    await waitFor(() => expect(mockListPortForward).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText(/Start port forward/i));
    fireEvent.click(screen.getByRole('button', { name: 'translation|Start' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText(/Start port forward/i)).toBeEnabled();
  });

  it('shows reconnecting progress rather than a live URL', async () => {
    mockListPortForward.mockResolvedValue([{ ...runningPortForward, status: 'Reconnecting' }]);
    renderPortForward();
    expect(await screen.findByText('translation|Reconnecting...')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Stop port forward/i)).toBeEnabled();
  });

  it('reports list failures without losing the ability to start a new forward', async () => {
    mockListPortForward.mockRejectedValue(null);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      renderPortForward();
      expect(await screen.findByRole('alert')).toHaveTextContent('Failed to list port forwards');
      expect(screen.getByLabelText(/Start port forward/i)).toBeEnabled();
      expect(log).toHaveBeenCalledWith('Failed to list port forwards', null);
    } finally {
      log.mockRestore();
    }
  });

  it('resolves a service named target port from its selected pod when starting', async () => {
    const pod = makePod();
    pod.spec.containers = [
      {
        name: 'web',
        image: 'nginx',
        imagePullPolicy: 'IfNotPresent',
        ports: [{ name: 'http', containerPort: 8081, protocol: 'TCP' }],
      },
    ];
    mockUsePodList.mockReturnValue([[pod], null]);
    mockListPortForward.mockResolvedValue([]);
    mockStartPortForward.mockResolvedValue({ ...runningPortForward, targetPort: '8081' });
    const service = {
      kind: 'Service',
      cluster: 'service-cluster',
      metadata: { ...pod.metadata, name: 'web-service' },
      jsonData: { spec: { selector: { app: 'web', tier: 'frontend' } } },
    };
    render(
      <TestContext>
        <PortForward containerPort="http" resource={service} />
      </TestContext>
    );
    await waitFor(() => expect(mockListPortForward).toHaveBeenCalledWith('service-cluster'));
    fireEvent.click(screen.getByLabelText(/Start port forward/i));
    fireEvent.click(screen.getByRole('button', { name: 'translation|Start' }));
    await waitFor(() =>
      expect(mockStartPortForward).toHaveBeenCalledWith(
        { cluster: 'service-cluster', revision: undefined },
        {
          id: '',
          namespace: 'default',
          pod: 'my-pod',
          targetPort: '8081',
          service: 'web-service',
          serviceNamespace: 'default',
          port: undefined,
          address: 'localhost',
        }
      )
    );
    expect(mockUsePodList).toHaveBeenCalledWith({
      namespace: 'default',
      labelSelector: 'app=web,tier=frontend',
      cluster: 'service-cluster',
    });
  });

  it('chooses a free Docker Desktop port after a collision and binds all interfaces', async () => {
    mockIsDockerDesktop.mockReturnValue(true);
    mockListPortForward.mockResolvedValue([]);
    mockStartPortForward.mockResolvedValue(runningPortForward);
    localStorage.setItem(
      PORT_FORWARDS_STORAGE_KEY,
      JSON.stringify([{ ...runningPortForward, id: 'busy', pod: 'other-pod', port: '30000' }])
    );
    const random = vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValue(0.5);
    try {
      renderPortForward();
      await waitFor(() => expect(mockListPortForward).toHaveBeenCalled());
      // Another active forward can be recorded after the initial server reconciliation.
      localStorage.setItem(
        PORT_FORWARDS_STORAGE_KEY,
        JSON.stringify([{ ...runningPortForward, id: 'busy', pod: 'other-pod', port: '30000' }])
      );
      fireEvent.click(screen.getByLabelText(/Start port forward/i));
      fireEvent.click(screen.getByRole('button', { name: 'translation|Start' }));
      await waitFor(() =>
        expect(mockStartPortForward).toHaveBeenCalledWith(
          { cluster: 'test-cluster', revision: undefined },
          {
            id: '',
            namespace: 'default',
            pod: 'my-pod',
            targetPort: '80',
            service: '',
            serviceNamespace: 'default',
            port: '31000',
            address: '0.0.0.0',
          }
        )
      );
      expect(random).toHaveBeenCalledTimes(2);
    } finally {
      random.mockRestore();
    }
  });

  it('ignores a pending list response after unmounting', async () => {
    let finish: (value: (typeof runningPortForward)[]) => void = () => {};
    mockListPortForward.mockReturnValue(
      new Promise<(typeof runningPortForward)[]>(resolve => {
        finish = resolve;
      })
    );
    const view = renderPortForward();
    view.unmount();
    await act(async () => finish([runningPortForward]));
    expect(localStorage.getItem(PORT_FORWARDS_STORAGE_KEY)).toBeNull();
  });

  it('does not offer port forwarding outside Electron or for failed pods', () => {
    mockIsElectron.mockReturnValue(false);
    const view = renderPortForward();
    expect(screen.queryByLabelText(/Start port forward/i)).not.toBeInTheDocument();
    view.unmount();
    mockIsElectron.mockReturnValue(true);
    const pod = makePod();
    pod.status.phase = 'Failed';
    render(
      <TestContext>
        <PortForward containerPort={80} resource={pod} />
      </TestContext>
    );
    expect(screen.queryByLabelText(/Start port forward/i)).not.toBeInTheDocument();
    expect(mockListPortForward).not.toHaveBeenCalled();
  });
});

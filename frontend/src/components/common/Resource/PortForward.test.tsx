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
import PortForward, { PORT_FORWARD_STOP_STATUS } from './PortForward';

const { mockListPortForward, mockStopOrDeletePortForward } = vi.hoisted(() => ({
  mockListPortForward: vi.fn(),
  mockStopOrDeletePortForward: vi.fn(),
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
  startPortForward: vi.fn(),
  stopOrDeletePortForward: (...args: any[]) => mockStopOrDeletePortForward(...args),
}));
vi.mock('../../../lib/k8s/pod', () => ({
  default: { useList: () => [[], null] },
}));
vi.mock('../../portforward/PortForwardStartDialog', () => ({ default: () => null }));

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
    });
  });

  it('PORT_FORWARD_STOP_STATUS constant equals "Stopped"', () => {
    expect(PORT_FORWARD_STOP_STATUS).toBe('Stopped');
  });
});

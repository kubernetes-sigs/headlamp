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

import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SnackbarProvider } from 'notistack';
import { ComponentType, ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteCluster } from '../../../lib/k8s/api/v1/clusterApi';
import { Cluster } from '../../../lib/k8s/cluster';
import { createMuiTheme } from '../../../lib/themes';
import ClusterContextMenu from './ClusterContextMenu';
import ClusterTable from './ClusterTable';

const theme = createMuiTheme({ name: 'light', base: 'light' });
let ClusterEmptyState: ComponentType<{ defaultContent: ReactNode }> | null = null;
const { dispatchMock } = vi.hoisted(() => ({ dispatchMock: vi.fn() }));

function renderWithTheme(ui: ReactNode) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

function LocationDisplay() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

vi.mock('react-i18next', async importOriginal => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key.split('|').pop() ?? key,
    }),
  };
});

vi.mock('react-redux', () => ({
  useDispatch: () => dispatchMock,
}));

vi.mock('../../../lib/k8s/api/v1/clusterApi', () => ({
  deleteCluster: vi.fn(),
}));

vi.mock('../../../helpers', () => ({
  default: {
    isElectron: () => true,
  },
}));

vi.mock('../../../redux/hooks', () => ({
  useTypedSelector: (selector: (state: any) => any) =>
    selector({
      clusterProvider: {
        clusterStatuses: [],
        dialogs: [],
        menuItems: [],
        clusterEmptyState: ClusterEmptyState,
      },
      config: {
        allowKubeconfigChanges: true,
        isDynamicClusterEnabled: true,
      },
    }),
}));

vi.mock('../../common', () => ({
  Loader: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('../../common/Table', () => ({
  default: ({ columns, data }: { columns: any[]; data: Cluster[] }) => {
    const originColumn = columns.find(column => column.id === 'origin');
    const statusColumn = columns.find(column => column.id === 'status');
    return (
      <table>
        <tbody>
          {data.map(cluster => (
            <tr
              key={cluster.name}
              data-testid={`cluster-row-${cluster.name}`}
              data-status-accessor={statusColumn.accessorFn(cluster) ?? ''}
            >
              <td>{originColumn.Cell({ row: { original: cluster } })}</td>
              <td>{statusColumn.Cell({ row: { original: cluster } })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  },
}));

describe('ClusterTable', () => {
  afterEach(() => {
    vi.clearAllMocks();
    ClusterEmptyState = null;
  });

  it('renders the standard empty state when no custom state is registered', () => {
    renderWithTheme(
      <MemoryRouter>
        <ClusterTable
          customNameClusters={[]}
          clusters={{}}
          versions={{}}
          errors={{}}
          warningLabels={{}}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('No clusters found')).toBeInTheDocument();
  });

  it('renders a registered cluster empty state instead of the default', () => {
    ClusterEmptyState = () => <div>Choose a cluster provider</div>;

    renderWithTheme(
      <MemoryRouter>
        <ClusterTable
          customNameClusters={[]}
          clusters={{}}
          versions={{}}
          errors={{}}
          warningLabels={{}}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Choose a cluster provider')).toBeInTheDocument();
    expect(screen.queryByText('No clusters found')).not.toBeInTheDocument();
  });

  it('passes the standard empty state to a registered wrapper', () => {
    ClusterEmptyState = ({ defaultContent }) => (
      <section>
        <div>Before</div>
        {defaultContent}
      </section>
    );

    renderWithTheme(
      <MemoryRouter>
        <ClusterTable
          customNameClusters={[]}
          clusters={{}}
          versions={{}}
          errors={{}}
          warningLabels={{}}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Before')).toBeInTheDocument();
    expect(screen.getByText('No clusters found')).toBeInTheDocument();
  });

  it('renders Cluster Inventory source labels', () => {
    const cluster = {
      name: 'spoke-a',
      auth_type: '',
      meta_data: {
        source: 'cluster_inventory',
      },
    } as Cluster;

    renderWithTheme(
      <MemoryRouter>
        <ClusterTable
          customNameClusters={[cluster]}
          clusters={{ 'spoke-a': cluster }}
          versions={{}}
          errors={{ 'spoke-a': null }}
          warningLabels={{}}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Cluster Inventory')).toBeInTheDocument();
  });

  it('renders in-cluster source labels', () => {
    const cluster = {
      name: 'in-cluster',
      auth_type: '',
      meta_data: {
        source: 'incluster',
      },
    } as Cluster;

    renderWithTheme(
      <MemoryRouter>
        <ClusterTable
          customNameClusters={[cluster]}
          clusters={{ 'in-cluster': cluster }}
          versions={{}}
          errors={{ 'in-cluster': null }}
          warningLabels={{}}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('In-cluster')).toBeInTheDocument();
  });

  it('renders unhealthy Cluster Inventory control plane status', () => {
    const cluster = {
      name: 'spoke-a',
      auth_type: '',
      meta_data: {
        source: 'cluster_inventory',
        clusterInventory: {
          conditions: [
            {
              type: 'ControlPlaneHealthy',
              status: 'False',
              reason: 'HealthCheckFailed',
              message: 'control plane endpoint is not ready',
              lastTransitionTime: '2026-05-10T00:00:00Z',
            },
          ],
        },
      },
    } as Cluster;

    renderWithTheme(
      <MemoryRouter>
        <ClusterTable
          customNameClusters={[cluster]}
          clusters={{ 'spoke-a': cluster }}
          versions={{}}
          errors={{ 'spoke-a': null }}
          warningLabels={{}}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Control plane unhealthy')).toBeInTheDocument();
  });

  it('keeps Active status for healthy Cluster Inventory clusters', () => {
    const cluster = {
      name: 'spoke-a',
      auth_type: '',
      meta_data: {
        source: 'cluster_inventory',
        clusterInventory: {
          conditions: [
            {
              type: 'ControlPlaneHealthy',
              status: 'True',
            },
          ],
        },
      },
    } as Cluster;

    renderWithTheme(
      <MemoryRouter>
        <ClusterTable
          customNameClusters={[cluster]}
          clusters={{ 'spoke-a': cluster }}
          versions={{}}
          errors={{ 'spoke-a': null }}
          warningLabels={{}}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('falls back to reachability status when Cluster Inventory condition is missing', () => {
    const cluster = {
      name: 'spoke-a',
      auth_type: '',
      meta_data: {
        source: 'cluster_inventory',
        clusterInventory: {
          conditions: [],
        },
      },
    } as Cluster;

    renderWithTheme(
      <MemoryRouter>
        <ClusterTable
          customNameClusters={[cluster]}
          clusters={{ 'spoke-a': cluster }}
          versions={{}}
          errors={{ 'spoke-a': { status: 500, message: 'dial tcp timeout' } as any }}
          warningLabels={{}}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Unavailable')).toBeInTheDocument();
  });

  it('keeps status accessor aligned with reachability errors for unknown control plane health', () => {
    const cluster = {
      name: 'spoke-a',
      auth_type: '',
      meta_data: {
        source: 'cluster_inventory',
        clusterInventory: {
          conditions: [
            {
              type: 'ControlPlaneHealthy',
              status: 'Unknown',
            },
          ],
        },
      },
    } as Cluster;

    renderWithTheme(
      <MemoryRouter>
        <ClusterTable
          customNameClusters={[cluster]}
          clusters={{ 'spoke-a': cluster }}
          versions={{}}
          errors={{ 'spoke-a': { status: 500, message: 'dial tcp timeout' } as any }}
          warningLabels={{}}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByTestId('cluster-row-spoke-a')).toHaveAttribute(
      'data-status-accessor',
      'Unavailable'
    );
  });

  it('renders permission errors in the status cell and accessor', () => {
    const cluster = {
      name: 'spoke-a',
      auth_type: '',
      meta_data: {
        source: 'kubeconfig',
      },
    } as Cluster;

    renderWithTheme(
      <MemoryRouter>
        <ClusterTable
          customNameClusters={[cluster]}
          clusters={{ 'spoke-a': cluster }}
          versions={{}}
          errors={{ 'spoke-a': { status: 403, message: 'Forbidden' } as any }}
          warningLabels={{}}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Insufficient permissions')).toBeInTheDocument();
    expect(screen.getByTestId('cluster-row-spoke-a')).toHaveAttribute(
      'data-status-accessor',
      'Insufficient permissions'
    );
  });

  it('shows a Connect action for clusters that are not auto-connected', () => {
    const cluster = {
      name: 'spoke-a',
      auth_type: '',
      meta_data: { source: 'kubeconfig' },
    } as Cluster;
    const onConnectCluster = vi.fn();

    renderWithTheme(
      <MemoryRouter>
        <ClusterTable
          customNameClusters={[cluster]}
          clusters={{ 'spoke-a': cluster }}
          versions={{}}
          errors={{}}
          warningLabels={{}}
          connectedClusterNames={new Set()}
          onConnectCluster={onConnectCluster}
        />
      </MemoryRouter>
    );

    const connectButton = screen.getByRole('button', { name: 'Connect' });
    expect(connectButton).toBeInTheDocument();

    fireEvent.click(connectButton);
    expect(onConnectCluster).toHaveBeenCalledWith('spoke-a');
  });

  it('does not show a Connect action for clusters that are auto-connected', () => {
    const cluster = {
      name: 'spoke-a',
      auth_type: '',
      meta_data: { source: 'kubeconfig' },
    } as Cluster;

    renderWithTheme(
      <MemoryRouter>
        <ClusterTable
          customNameClusters={[cluster]}
          clusters={{ 'spoke-a': cluster }}
          versions={{}}
          errors={{ 'spoke-a': null }}
          warningLabels={{}}
          connectedClusterNames={new Set(['spoke-a'])}
          onConnectCluster={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: 'Connect' })).not.toBeInTheDocument();
  });
});

describe('ClusterContextMenu', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('updates the config before notifying the page after deleting a cluster', async () => {
    vi.mocked(deleteCluster).mockResolvedValue({} as Awaited<ReturnType<typeof deleteCluster>>);
    const onClusterRemoved = vi.fn();

    render(
      <SnackbarProvider>
        <MemoryRouter>
          <ClusterContextMenu
            onClusterRemoved={onClusterRemoved}
            cluster={
              {
                name: 'spoke-a',
                auth_type: '',
                meta_data: {
                  source: 'kubeconfig',
                },
              } as Cluster
            }
          />
        </MemoryRouter>
      </SnackbarProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
    fireEvent.click(screen.getByText('Delete'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(onClusterRemoved).toHaveBeenCalledOnce());
    expect(dispatchMock).toHaveBeenCalledOnce();
    expect(dispatchMock.mock.invocationCallOrder[0]).toBeLessThan(
      onClusterRemoved.mock.invocationCallOrder[0]
    );
  });

  it('keeps the page open when deleting a cluster fails', async () => {
    vi.mocked(deleteCluster).mockRejectedValue(new Error('request failed'));
    const onClusterRemoved = vi.fn();

    render(
      <SnackbarProvider>
        <MemoryRouter initialEntries={['/c/spoke-a']}>
          <ClusterContextMenu
            onClusterRemoved={onClusterRemoved}
            cluster={
              {
                name: 'spoke-a',
                auth_type: '',
                meta_data: {
                  source: 'dynamic_cluster',
                },
              } as Cluster
            }
          />
          <LocationDisplay />
        </MemoryRouter>
      </SnackbarProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
    fireEvent.click(screen.getByText('Delete'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to delete cluster');
    expect(onClusterRemoved).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent('/c/spoke-a');
  });

  it('does not show delete actions for Cluster Inventory clusters', () => {
    render(
      <SnackbarProvider>
        <MemoryRouter>
          <ClusterContextMenu
            cluster={
              {
                name: 'spoke-a',
                auth_type: '',
                meta_data: {
                  source: 'cluster_inventory',
                },
              } as Cluster
            }
          />
        </MemoryRouter>
      </SnackbarProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Actions' }));

    expect(screen.getByText('View')).toBeInTheDocument();
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });
});

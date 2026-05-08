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

import { fireEvent, render, screen } from '@testing-library/react';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Cluster } from '../../../lib/k8s/cluster';
import ClusterContextMenu from './ClusterContextMenu';
import ClusterTable from './ClusterTable';

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
  useDispatch: () => vi.fn(),
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
    return (
      <table>
        <tbody>
          {data.map(cluster => (
            <tr key={cluster.name}>
              <td>{originColumn.Cell({ row: { original: cluster } })}</td>
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
  });

  it('renders Cluster Inventory source labels', () => {
    const cluster = {
      name: 'spoke-a',
      auth_type: '',
      meta_data: {
        source: 'cluster_inventory',
      },
    } as Cluster;

    render(
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

    render(
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
});

describe('ClusterContextMenu', () => {
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

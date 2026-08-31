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
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../../lib/themes';
import { TestContext } from '../../../test';
import SettingsCluster from './SettingsCluster';

const clusterName = 'my-cluster';
const theme = createMuiTheme({ base: 'light', name: 'light' });
const darkTheme = createMuiTheme({ base: 'dark', name: 'dark' });

const { mockDeleteCluster, mockState } = vi.hoisted(() => ({
  mockDeleteCluster: vi.fn(),
  mockState: {
    activeCluster: 'my-cluster' as string | null,
    electron: false,
    clustersConf: {} as Record<string, any>,
  },
}));

vi.mock('../../../helpers/isElectron', () => ({ isElectron: () => mockState.electron }));

vi.mock('../../../lib/k8s', () => ({
  useCluster: () => mockState.activeCluster,
  useClustersConf: () => mockState.clustersConf,
}));

// Stub the selector resolver so the test does not pull in the real k8s model
// graph (Namespace -> KubeObject -> ...), matching how lib/k8s is mocked above.
vi.mock('../../../lib/k8s/allowedNamespaces', () => ({
  useAllowedNamespacesFromSelector: () => ({
    namespaces: [],
    isFetching: false,
    isSuccess: false,
    error: null,
  }),
}));

vi.mock('../../../lib/k8s/api/v1/clusterApi', () => ({ deleteCluster: mockDeleteCluster }));
vi.mock('../../common/ConfirmButton', () => ({
  default: ({ children, onConfirm }: { children: React.ReactNode; onConfirm: () => void }) => (
    <button onClick={onConfirm}>{children}</button>
  ),
}));
vi.mock('./ClusterNameEditor', () => ({ ClusterNameEditor: () => <div>Cluster name editor</div> }));
vi.mock('./ColorPicker', () => ({
  default: ({
    open,
    onClose,
    onSelectColor,
  }: {
    open: boolean;
    onClose: () => void;
    onSelectColor: (color: string) => void;
  }) =>
    open ? (
      <div>
        <button onClick={() => onSelectColor('#123456')}>Select test color</button>
        <button onClick={onClose}>Close color picker</button>
      </div>
    ) : null,
}));
vi.mock('./IconPicker', () => ({
  default: ({
    open,
    onClose,
    onSelectIcon,
  }: {
    open: boolean;
    onClose: () => void;
    onSelectIcon: (icon: string) => void;
  }) =>
    open ? (
      <div>
        <button onClick={() => onSelectIcon('mdi:test-tube')}>Select test icon</button>
        <button onClick={onClose}>Close icon picker</button>
      </div>
    ) : null,
}));
vi.mock('./NodeShellSettings', () => ({ default: () => null }));
vi.mock('./PodDebugSettings', () => ({ default: () => null }));

function renderSettings(
  settings: Record<string, unknown> = {},
  options: { queryCluster?: string | null; dark?: boolean } = {}
) {
  const { queryCluster = clusterName, dark = false } = options;
  localStorage.setItem(`cluster_settings.${clusterName}`, JSON.stringify(settings));
  return render(
    <TestContext urlSearchParams={queryCluster === null ? undefined : { c: queryCluster }}>
      <ThemeProvider theme={dark ? darkTheme : theme}>
        <SettingsCluster />
      </ThemeProvider>
    </TestContext>
  );
}

describe('SettingsCluster appearance controls', () => {
  beforeEach(() => {
    localStorage.clear();
    mockDeleteCluster.mockReset();
    mockState.activeCluster = clusterName;
    mockState.electron = false;
    mockState.clustersConf = {
      [clusterName]: {
        name: clusterName,
        meta_data: { namespace: 'default', source: 'kubeconfig' },
      },
    };
  });

  it('labels controls with their appearance subsection', () => {
    renderSettings();

    expect(
      screen.getByRole('button', { name: 'Appearance Accent color Choose Color' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Appearance Cluster icon Choose Icon' })
    ).toBeInTheDocument();
  });

  it('updates configured appearance values', async () => {
    renderSettings({ appearance: { accentColor: '#e91e63', icon: 'mdi:cloud-outline' } });

    expect(
      screen.getByRole('button', { name: 'Appearance Accent color Change Color' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Appearance Cluster icon Change Icon' })
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear accent color' }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear cluster icon' }));
    expect(
      screen.getByRole('button', { name: 'Appearance Accent color Choose Color' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Appearance Cluster icon Choose Icon' })
    ).toBeInTheDocument();
  });

  it('selects values from the appearance pickers', async () => {
    renderSettings();

    await userEvent.click(
      screen.getByRole('button', { name: 'Appearance Accent color Choose Color' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Select test color' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Appearance Cluster icon Choose Icon' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Select test icon' }));

    expect(
      screen.getByRole('button', { name: 'Appearance Accent color Change Color' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Appearance Cluster icon Change Icon' })
    ).toBeInTheDocument();
  });

  it('closes appearance pickers without changing values', async () => {
    renderSettings();

    await userEvent.click(
      screen.getByRole('button', { name: 'Appearance Accent color Choose Color' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Close color picker' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Appearance Cluster icon Choose Icon' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Close icon picker' }));

    expect(screen.queryByRole('button', { name: 'Close color picker' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close icon picker' })).not.toBeInTheDocument();
  });
});

describe('SettingsCluster states and namespaces', () => {
  beforeEach(() => {
    localStorage.clear();
    mockDeleteCluster.mockReset();
    mockState.activeCluster = clusterName;
    mockState.electron = false;
    mockState.clustersConf = {
      [clusterName]: {
        name: clusterName,
        meta_data: { namespace: 'default', source: 'kubeconfig' },
      },
    };
  });

  it('selects the first cluster when the query is missing', () => {
    renderSettings({}, { queryCluster: null });
    expect(
      screen.getByRole('button', { name: 'Appearance Accent color Choose Color' })
    ).toBeInTheDocument();
  });

  it('shows the empty state when no clusters exist', () => {
    mockState.activeCluster = null;
    mockState.clustersConf = {};
    renderSettings({}, { dark: true });
    expect(screen.getByText(/no clusters configured/i)).toBeInTheDocument();
  });

  it('shows an invalid-cluster message', () => {
    mockState.activeCluster = null;
    renderSettings({}, { queryCluster: 'missing-cluster', dark: true });
    expect(screen.getByText(/Cluster missing-cluster does not exist/i)).toBeInTheDocument();
  });

  it('validates and stores the default namespace', async () => {
    renderSettings();
    const input = screen.getByRole('textbox', { name: 'Default namespace' });

    await userEvent.type(input, 'Invalid Namespace');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    await userEvent.clear(input);
    await userEvent.type(input, 'team-a');

    expect(
      JSON.parse(localStorage.getItem(`cluster_settings.${clusterName}`) || '{}')
    ).toMatchObject({ defaultNamespace: 'team-a' });
  });

  it('adds, deduplicates, and removes allowed namespaces', async () => {
    renderSettings({ allowedNamespaces: ['zeta'] });
    const input = screen.getByRole('textbox', { name: 'Allowed namespaces' });

    await userEvent.type(input, 'alpha');
    await userEvent.keyboard('{Enter}');
    await userEvent.type(input, 'alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Add namespace' }));
    const alphaChip = screen.getByText('alpha').closest('.MuiChip-root');
    await userEvent.click(alphaChip?.querySelector('svg') as SVGElement);

    expect(screen.queryByText('alpha')).not.toBeInTheDocument();
    expect(screen.getByText('zeta')).toBeInTheDocument();
  });

  it('renders Electron controls and removes a dynamic cluster', async () => {
    mockState.electron = true;
    mockState.clustersConf[clusterName].meta_data.source = 'dynamic_cluster';
    mockDeleteCluster.mockResolvedValue({ clusters: {} });
    renderSettings();

    expect(screen.getByText('Cluster name editor')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Cluster' }));
    await waitFor(() => expect(mockDeleteCluster).toHaveBeenCalledWith(clusterName));
  });

  it('handles a dynamic cluster removal failure', async () => {
    mockState.electron = true;
    mockState.clustersConf[clusterName].meta_data.source = 'dynamic_cluster';
    mockDeleteCluster.mockRejectedValue(new Error('remove failed'));
    renderSettings();

    await userEvent.click(screen.getByRole('button', { name: 'Remove Cluster' }));
    await waitFor(() => expect(mockDeleteCluster).toHaveBeenCalledWith(clusterName));
  });
});

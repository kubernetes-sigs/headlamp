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
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { storeClusterSettings } from '../../../helpers/clusterSettings';
import { notifyClusterTagsChanged } from '../../../helpers/clusterTags';
import { parseKubeConfig, renameCluster } from '../../../lib/k8s/api/v1/clusterApi';
import { createMuiTheme } from '../../../lib/themes';
import { findKubeconfigByClusterName } from '../../../stateless/findKubeconfigByClusterName';
import { updateStatelessClusterKubeconfig } from '../../../stateless/updateStatelessClusterKubeconfig';
import { TestContext } from '../../../test';
import { ClusterNameEditor } from './ClusterNameEditor';
import { useClusterSettings } from './useClusterSettings';

vi.mock('../../../lib/k8s/api/v1/clusterApi', () => ({
  parseKubeConfig: vi.fn(),
  renameCluster: vi.fn(),
}));

vi.mock('../../../stateless/findKubeconfigByClusterName', () => ({
  findKubeconfigByClusterName: vi.fn(),
}));

vi.mock('../../../stateless/updateStatelessClusterKubeconfig', () => ({
  updateStatelessClusterKubeconfig: vi.fn(),
}));

afterEach(() => localStorage.clear());
const theme = createMuiTheme({ base: 'light', name: 'light' });

function Editor({ cluster = 'test' }: { cluster?: string }) {
  const [settings, setSettings] = useClusterSettings(cluster);
  return (
    <ThemeProvider theme={theme}>
      <ClusterNameEditor
        cluster={cluster}
        clusterConf={{
          [cluster]: { name: cluster, auth_type: '', meta_data: { source: 'kubeconfig' } },
        }}
        clusterSettings={settings}
        setClusterSettings={setSettings}
      />
      <output data-testid="tags">{JSON.stringify(settings.tags)}</output>
    </ThemeProvider>
  );
}

it.each(['same-cluster storage', 'other-cluster notification'])(
  'retains a name draft during %s',
  async notification => {
    storeClusterSettings('test', { currentName: 'saved', tags: { env: 'old' } });
    render(
      <TestContext>
        <Editor />
      </TestContext>
    );
    const name = screen.getByRole('textbox', { name: 'Name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'unsaved');
    act(() => {
      if (notification === 'same-cluster storage') {
        storeClusterSettings('test', { currentName: 'saved', tags: { env: 'new' } });
        window.dispatchEvent(new StorageEvent('storage', { key: 'cluster_settings.test' }));
      } else {
        storeClusterSettings('other', { tags: { env: 'new' } });
        notifyClusterTagsChanged();
      }
    });
    expect(name).toHaveValue('unsaved');
    expect(screen.getByTestId('tags')).toHaveTextContent(
      notification === 'same-cluster storage' ? 'new' : 'old'
    );
  }
);

it('resets the name input when the selected cluster changes', async () => {
  storeClusterSettings('test', { currentName: 'first' });
  storeClusterSettings('next', { currentName: 'second' });
  const { rerender } = render(
    <TestContext>
      <Editor />
    </TestContext>
  );
  const name = screen.getByRole('textbox', { name: 'Name' });
  await userEvent.clear(name);
  await userEvent.type(name, 'unsaved');
  rerender(
    <TestContext>
      <Editor cluster="next" />
    </TestContext>
  );
  expect(name).toHaveValue('second');
});

it('validates invalid characters, strips spaces, and flags duplicate cluster names', async () => {
  render(
    <TestContext>
      <ThemeProvider theme={theme}>
        <ClusterNameEditor
          cluster="renamed-cluster"
          clusterConf={{
            'renamed-cluster': {
              name: 'renamed-cluster',
              auth_type: '',
              meta_data: { source: 'kubeconfig', originalName: 'orig-cluster' },
            },
            other: { name: 'taken-name', auth_type: '', meta_data: { source: 'kubeconfig' } },
          }}
          clusterSettings={{ currentName: 'renamed-cluster' }}
          setClusterSettings={vi.fn()}
        />
      </ThemeProvider>
    </TestContext>
  );

  expect(screen.getByText('Original name: orig-cluster')).toBeInTheDocument();

  const input = screen.getByRole('textbox', { name: /^Name/ });
  const applyBtn = screen.getByRole('button', { name: 'Apply' });

  await userEvent.clear(input);
  expect(applyBtn).toBeDisabled();

  await userEvent.type(input, 'Invalid_Name');
  expect(
    screen.getByText(
      "Cluster name must contain only lowercase alphanumeric characters or '-', and must start and end with an alphanumeric character."
    )
  ).toBeInTheDocument();
  expect(applyBtn).toBeDisabled();

  await userEvent.clear(input);
  await userEvent.type(input, 'taken name');
  expect(input).toHaveValue('takenname');

  await userEvent.clear(input);
  await userEvent.type(input, 'taken-name');
  expect(
    screen.getByText('This custom name is already in use, please choose a different name.')
  ).toBeInTheDocument();
  expect(applyBtn).toBeDisabled();
});

it('handles renameCluster success (non-stateless and stateless) and error dialog', async () => {
  const reloadSpy = vi.fn();
  const originalLocation = window.location;
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, reload: reloadSpy },
  });

  try {
    vi.mocked(renameCluster).mockResolvedValue({ clusters: {} } as any);
    vi.mocked(findKubeconfigByClusterName).mockResolvedValue(null);

    render(
      <TestContext>
        <ThemeProvider theme={theme}>
          <ClusterNameEditor
            cluster="my-cluster"
            clusterConf={{
              'my-cluster': {
                name: 'my-cluster',
                auth_type: '',
                meta_data: { source: 'kubeconfig', clusterID: 'cid-1' },
              },
            }}
            clusterSettings={{ currentName: 'my-cluster' }}
            setClusterSettings={vi.fn()}
          />
        </ThemeProvider>
      </TestContext>
    );

    const input = screen.getByRole('textbox', { name: 'Name' });
    await userEvent.clear(input);
    await userEvent.type(input, 'new-cluster');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Yes' }));
    await waitFor(() => {
      expect(renameCluster).toHaveBeenCalledWith(
        'my-cluster',
        'new-cluster',
        'kubeconfig',
        'cid-1'
      );
      expect(reloadSpy).toHaveBeenCalled();
    });

    // Stateless cluster rename path
    vi.mocked(findKubeconfigByClusterName).mockResolvedValue('kubeconfig-yaml' as any);
    vi.mocked(updateStatelessClusterKubeconfig).mockResolvedValue(undefined as any);
    vi.mocked(parseKubeConfig).mockResolvedValue({ clusters: [] } as any);
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(updateStatelessClusterKubeconfig).toHaveBeenCalled();
      expect(parseKubeConfig).toHaveBeenCalled();
    });

    // Error dialog path
    vi.mocked(renameCluster).mockRejectedValueOnce(new Error('rename failed'));
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByText('rename failed')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Okay' }));
    await waitFor(() => {
      expect(screen.queryByText('rename failed')).not.toBeInTheDocument();
    });
  } finally {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  }
});

it('renders gracefully when clusterConf is null', () => {
  render(
    <TestContext>
      <ThemeProvider theme={theme}>
        <ClusterNameEditor
          cluster="missing"
          clusterConf={null}
          clusterSettings={{}}
          setClusterSettings={vi.fn()}
        />
      </ThemeProvider>
    </TestContext>
  );

  expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument();
});

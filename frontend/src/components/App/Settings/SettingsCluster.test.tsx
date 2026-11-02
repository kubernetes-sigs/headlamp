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
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storeClusterSettings } from '../../../helpers/clusterSettings';
import i18n from '../../../i18n/config';
import { createMuiTheme } from '../../../lib/themes';
import { setConfig } from '../../../redux/configSlice';
import store from '../../../redux/stores/store';
import { enqueueConfigOperation } from '../../../stateless/configOperationQueue';
import { TestContext } from '../../../test';
import SettingsCluster from './SettingsCluster';
import * as tagStorage from './useClusterTagStorage';

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

  it('keeps delete publication ahead of a queued save so the delayed response cannot undo tags', async () => {
    mockState.electron = true;
    mockState.clustersConf[clusterName].meta_data.source = 'dynamic_cluster';
    const survivor = {
      name: 'survivor',
      auth_type: '',
      meta_data: { extensions: { headlamp_info: { tags: { env: 'old' } } } },
    };
    let finish!: (config: { clusters: Record<string, typeof survivor> }) => void;
    mockDeleteCluster.mockReturnValueOnce(new Promise(resolve => (finish = resolve)));
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Cluster' }));
    await waitFor(() => expect(mockDeleteCluster).toHaveBeenCalledTimes(1));
    const save = vi.fn(async () => {
      expect(store.getState().config.clusters).toEqual({ survivor });
      store.dispatch(
        setConfig({
          clusters: {
            survivor: {
              ...survivor,
              meta_data: { extensions: { headlamp_info: { tags: { env: 'new' } } } },
            },
          },
        })
      );
    });
    const saving = enqueueConfigOperation(save);
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      finish({ clusters: { survivor } });
      await saving;
    });
    expect(
      store.getState().config.clusters?.survivor.meta_data?.extensions?.headlamp_info?.tags
    ).toEqual({ env: 'new' });
    expect(store.getState().config.clusters).not.toHaveProperty(clusterName);
    store.dispatch(setConfig({ clusters: null }));
  });

  it('tags controls with their appearance subsection', () => {
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

describe('SettingsCluster tags', () => {
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

  afterEach(() => {
    localStorage.clear();
  });

  function storedTags() {
    return JSON.parse(localStorage.getItem(`cluster_settings.${clusterName}`) || '{}').tags;
  }

  it('saves edited tags', async () => {
    renderSettings({ tags: { environment: 'production' } });

    await userEvent.clear(screen.getByRole('textbox', { name: 'Tag value' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Tag value' }), 'staging');
    await userEvent.click(screen.getByRole('button', { name: 'Save tags' }));

    expect(storedTags()).toEqual({ environment: 'staging' });
  });

  it('keeps unsaved tags when unrelated cluster metadata changes', async () => {
    mockState.clustersConf[clusterName].meta_data.extensions = {
      headlamp_info: { tags: { environment: 'production' } },
    };
    const { rerender } = renderSettings();
    await userEvent.clear(screen.getByRole('textbox', { name: 'Tag value' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Tag value' }), 'draft');
    mockState.clustersConf = {
      [clusterName]: JSON.parse(JSON.stringify(mockState.clustersConf[clusterName])),
      other: { name: 'other', meta_data: { source: 'kubeconfig', namespace: 'changed' } },
    };
    rerender(
      <TestContext urlSearchParams={{ c: clusterName }}>
        <ThemeProvider theme={theme}>
          <SettingsCluster />
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.getByRole('textbox', { name: 'Tag value' })).toHaveValue('draft');
    expect(screen.getByRole('button', { name: 'Save tags' })).toBeEnabled();
    mockState.clustersConf = {
      ...mockState.clustersConf,
      [clusterName]: {
        ...mockState.clustersConf[clusterName],
        meta_data: {
          extensions: { headlamp_info: { tags: { environment: 'updated' } } },
        },
      },
    };
    rerender(
      <TestContext urlSearchParams={{ c: clusterName }}>
        <ThemeProvider theme={theme}>
          <SettingsCluster />
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.getByRole('textbox', { name: 'Tag value' })).toHaveValue('updated');
  });

  it('refreshes a removed cross-tab override without discarding unrelated input drafts', async () => {
    mockState.clustersConf[clusterName].meta_data.extensions = {
      headlamp_info: { tags: { environment: 'context' } },
    };
    renderSettings({ tags: { environment: 'override' }, appearance: { accentColor: '#123456' } });
    await userEvent.type(screen.getByRole('textbox', { name: 'Default namespace' }), 'draft');
    act(() => {
      storeClusterSettings(clusterName, { appearance: { accentColor: '#123456' } });
      window.dispatchEvent(new StorageEvent('storage', { key: `cluster_settings.${clusterName}` }));
    });
    expect(screen.getByRole('textbox', { name: 'Tag value' })).toHaveValue('context');
    expect(screen.getByRole('textbox', { name: 'Default namespace' })).toHaveValue('draft');
    await userEvent.click(screen.getByRole('button', { name: 'Clear accent color' }));
    expect(storedTags()).toBeUndefined();
  });

  it('disables all tag edits during a delayed save and unlocks the submitted draft on failure', async () => {
    let finish!: (success: boolean) => void;
    const pending = new Promise<boolean>(resolve => (finish = resolve));
    const storage = vi.spyOn(tagStorage, 'useClusterTagStorage').mockImplementation(() => {
      const [saving, setSaving] = useState(false);
      return {
        saving,
        error: '',
        helpText: '',
        save: async () => {
          setSaving(true);
          const result = await pending;
          setSaving(false);
          return result;
        },
      };
    });
    try {
      renderSettings({ tags: { environment: 'production' } });
      await userEvent.clear(screen.getByRole('textbox', { name: 'Tag value' }));
      await userEvent.type(screen.getByRole('textbox', { name: 'Tag value' }), 'submitted');
      await userEvent.click(screen.getByRole('button', { name: 'Save tags' }));
      expect(screen.getByRole('textbox', { name: 'Tag key' })).toBeDisabled();
      expect(screen.getByRole('textbox', { name: 'Tag value' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Add tag' })).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Remove tag environment=submitted' })
      ).toBeDisabled();
      await userEvent.type(screen.getByRole('textbox', { name: 'Tag value' }), 'lost');
      await act(async () => {
        finish(false);
        await pending;
      });
      expect(screen.getByRole('textbox', { name: 'Tag value' })).toHaveValue('submitted');
      expect(screen.getByRole('textbox', { name: 'Tag value' })).toBeEnabled();
    } finally {
      storage.mockRestore();
    }
  });

  it.each(['clusterID', 'server', 'same-ID server', 'same-ID authentication'])(
    'resets old tag drafts for a same-named replacement %s',
    async field => {
      mockState.clustersConf[clusterName] = {
        name: clusterName,
        server: 'https://first.example',
        auth_type: '',
        meta_data: {
          source: field === 'server' ? 'dynamic_cluster' : 'kubeconfig',
          clusterID: field === 'server' ? undefined : 'first+cluster',
          extensions: { headlamp_info: { tags: { env: 'saved' } } },
        },
      };
      const { rerender } = renderSettings();
      await userEvent.clear(screen.getByRole('textbox', { name: 'Tag key' }));
      mockState.clustersConf = {
        [clusterName]: {
          ...mockState.clustersConf[clusterName],
          server: field.includes('server') ? 'https://second.example' : 'https://first.example',
          auth_type: field === 'same-ID authentication' ? 'oidc' : '',
          meta_data: {
            ...mockState.clustersConf[clusterName].meta_data,
            clusterID:
              field === 'clusterID'
                ? 'second+cluster'
                : mockState.clustersConf[clusterName].meta_data.clusterID,
          },
        },
      };
      rerender(
        <TestContext urlSearchParams={{ c: clusterName }}>
          <ThemeProvider theme={theme}>
            <SettingsCluster />
          </ThemeProvider>
        </TestContext>
      );
      expect(screen.getByRole('textbox', { name: 'Tag key' })).toHaveValue('env');
      expect(screen.getByRole('textbox', { name: 'Tag value' })).toHaveValue('saved');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save tags' })).toBeDisabled();
    }
  );

  it('drops invalid editor rows when saved context tags are removed', async () => {
    mockState.clustersConf[clusterName].meta_data.extensions = {
      headlamp_info: { tags: { environment: 'production' } },
    };
    const { rerender } = renderSettings();
    await userEvent.clear(screen.getByRole('textbox', { name: 'Tag key' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Every tag needs a key');
    mockState.clustersConf = {
      [clusterName]: {
        ...mockState.clustersConf[clusterName],
        meta_data: { extensions: { headlamp_info: { tags: {} } } },
      },
    };
    rerender(
      <TestContext urlSearchParams={{ c: clusterName }}>
        <ThemeProvider theme={theme}>
          <SettingsCluster />
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.queryByRole('textbox', { name: 'Tag key' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled();
  });

  it('does not apply a completed tag save to another selected cluster', async () => {
    let completeSave!: (saved: boolean) => void;
    const pendingSave = new Promise<boolean>(resolve => {
      completeSave = resolve;
    });
    const storage = vi.spyOn(tagStorage, 'useClusterTagStorage').mockReturnValue({
      save: () => pendingSave,
      saving: false,
      error: '',
      helpText: '',
    });
    const otherSettings = {
      tags: { environment: 'other' },
      appearance: { accentColor: '#123456' },
    };
    localStorage.setItem('cluster_settings.other-cluster', JSON.stringify(otherSettings));
    mockState.clustersConf['other-cluster'] = {
      name: 'other-cluster',
      meta_data: { source: 'kubeconfig' },
    };

    try {
      renderSettings({ tags: { environment: 'production' } });
      await userEvent.clear(screen.getByRole('textbox', { name: 'Tag value' }));
      await userEvent.type(screen.getByRole('textbox', { name: 'Tag value' }), 'staging');
      await userEvent.click(screen.getByRole('button', { name: 'Save tags' }));
      await userEvent.click(screen.getByRole('combobox'));
      await userEvent.click(screen.getByRole('option', { name: 'other-cluster' }));
      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: 'Tag value' })).toHaveValue('other')
      );
      await act(async () => {
        completeSave(true);
        await pendingSave;
      });
      expect(screen.getByRole('textbox', { name: 'Tag value' })).toHaveValue('other');
      await userEvent.click(screen.getByRole('button', { name: 'Clear accent color' }));
      expect(JSON.parse(localStorage.getItem('cluster_settings.other-cluster')!)).toMatchObject({
        tags: otherSettings.tags,
      });
    } finally {
      storage.mockRestore();
    }
  });

  it('does not delete a saved label when its key is cleared', async () => {
    renderSettings({ tags: { environment: 'production' } });

    await userEvent.clear(screen.getByRole('textbox', { name: 'Tag key' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Every tag needs a key');
    expect(screen.getByRole('button', { name: 'Save tags' })).toBeDisabled();
    expect(storedTags()).toEqual({ environment: 'production' });

    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Tag key' })).toHaveValue('environment');
    expect(screen.getByRole('button', { name: 'Save tags' })).toBeDisabled();
  });

  it('discards a new row without a key, although the tags are unchanged', async () => {
    renderSettings({ tags: { environment: 'production' } });

    await userEvent.click(screen.getByRole('button', { name: 'Add tag' }));
    const keys = screen.getAllByRole('textbox', { name: 'Tag key' });
    await userEvent.clear(keys[keys.length - 1]);

    expect(screen.getByRole('button', { name: 'Save tags' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(screen.getAllByRole('textbox', { name: 'Tag key' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled();
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

  // Reset the app's shared i18n instance back to English in case a test
  // below switched languages, so later tests aren't affected. Wrapped in
  // act() since the still-mounted component from the test re-renders when
  // the language changes.
  afterEach(async () => {
    await act(() => i18n.changeLanguage('en'));
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

  it('shows a translated loading indicator while there is no cluster in the URL', async () => {
    mockState.activeCluster = null;
    mockState.clustersConf = {};

    await i18n.changeLanguage('fr');
    renderSettings({}, { queryCluster: null });

    expect(screen.getByRole('progressbar', { name: 'Chargement' })).toBeInTheDocument();
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

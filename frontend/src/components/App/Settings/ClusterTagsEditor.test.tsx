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

import '../../../i18n/config';
import { ThemeProvider } from '@mui/material/styles';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { storeClusterSettings } from '../../../helpers/clusterSettings';
import type { Cluster } from '../../../lib/k8s/cluster';
import { createMuiTheme } from '../../../lib/themes';
import { TestContext } from '../../../test';
import * as tagStorage from './useClusterTagStorage';

// Like CreateResourceForm.test.tsx: the tags editor comes from CreateResourceForm, which
// imports Namespace, and that is enough to pull in the lib/k8s barrel and its import cycle.
vi.mock('../../../lib/k8s/namespace', () => ({
  default: { useList: () => [[], null] },
}));

const { default: ClusterTagsDialog, getClusterTagRowProblems } = await import(
  './ClusterTagsEditor'
);

const theme = createMuiTheme({ base: 'light', name: 'light' });

function renderDialog(onClose = vi.fn()) {
  render(
    <TestContext>
      <ThemeProvider theme={theme}>
        <ClusterTagsDialog open cluster="my-cluster" onClose={onClose} />
      </ThemeProvider>
    </TestContext>
  );
  return within(screen.getByRole('dialog'));
}

function storedTags() {
  return JSON.parse(localStorage.getItem('cluster_settings.my-cluster') || '{}').tags;
}

describe('getClusterTagRowProblems', () => {
  it('reports rows without a key, duplicate keys and invalid tags', () => {
    expect(
      getClusterTagRowProblems([
        { key: 'environment', value: 'production' },
        { key: '', value: 'eu-west' },
        { key: 'environment', value: 'staging' },
        { key: 'bad key', value: 'x' },
        { key: 'team', value: '-platform' },
      ])
    ).toEqual({
      emptyKeyCount: 1,
      duplicateKeys: ['environment'],
      invalidKeys: ['bad key', 'team'],
    });
  });

  it('reports nothing for valid rows', () => {
    expect(
      getClusterTagRowProblems([
        { key: 'environment', value: 'production' },
        { key: 'example.com/team', value: '' },
      ])
    ).toEqual({ emptyKeyCount: 0, duplicateKeys: [], invalidKeys: [] });
  });
});

describe('ClusterTagsDialog', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('does not delete a saved label when its key is cleared', async () => {
    storeClusterSettings('my-cluster', { tags: { environment: 'production' } });
    const dialog = renderDialog();

    await userEvent.clear(dialog.getByRole('textbox', { name: 'Tag key' }));

    expect(dialog.getByRole('alert')).toHaveTextContent('Every tag needs a key');
    expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(storedTags()).toEqual({ environment: 'production' });
  });

  it('does not save duplicate keys', async () => {
    storeClusterSettings('my-cluster', { tags: { environment: 'production' } });
    const dialog = renderDialog();

    await userEvent.click(dialog.getByRole('button', { name: 'Add tag' }));
    const keys = dialog.getAllByRole('textbox', { name: 'Tag key' });
    await userEvent.clear(keys[1]);
    await userEvent.type(keys[1], 'environment');

    expect(dialog.getByRole('alert')).toHaveTextContent('Duplicate tag keys: environment');
    expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves valid tags', async () => {
    const onClose = vi.fn();
    const dialog = renderDialog(onClose);

    await userEvent.click(dialog.getByRole('button', { name: 'Add tag' }));
    await userEvent.clear(dialog.getByRole('textbox', { name: 'Tag key' }));
    await userEvent.type(dialog.getByRole('textbox', { name: 'Tag key' }), 'environment');
    await userEvent.type(dialog.getByRole('textbox', { name: 'Tag value' }), 'production');
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }));

    expect(storedTags()).toEqual({ environment: 'production' });
    expect(onClose).toHaveBeenCalled();
  });

  it('locks key, value, add and remove controls until a delayed save settles', async () => {
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
      storeClusterSettings('my-cluster', { tags: { env: 'old' } });
      const dialog = renderDialog();
      await userEvent.clear(dialog.getByRole('textbox', { name: 'Tag value' }));
      await userEvent.type(dialog.getByRole('textbox', { name: 'Tag value' }), 'submitted');
      await userEvent.click(dialog.getByRole('button', { name: 'Save' }));
      expect(dialog.getByRole('textbox', { name: 'Tag key' })).toBeDisabled();
      expect(dialog.getByRole('textbox', { name: 'Tag value' })).toBeDisabled();
      expect(dialog.getByRole('button', { name: 'Add tag' })).toBeDisabled();
      expect(dialog.getByRole('button', { name: 'Remove tag env=submitted' })).toBeDisabled();
      await userEvent.type(dialog.getByRole('textbox', { name: 'Tag value' }), 'lost');
      await act(async () => {
        finish(false);
        await pending;
      });
      expect(dialog.getByRole('textbox', { name: 'Tag value' })).toHaveValue('submitted');
      expect(dialog.getByRole('textbox', { name: 'Tag value' })).toBeEnabled();
    } finally {
      storage.mockRestore();
    }
  });

  it('keeps the open draft across equal saved metadata and resets for changed tags', async () => {
    const clusterInfo: Cluster = {
      name: 'my-cluster',
      auth_type: '',
      meta_data: { extensions: { headlamp_info: { tags: { env: 'prod' } } } },
    };
    const dialog = (info: Cluster, open = true) => (
      <TestContext>
        <ThemeProvider theme={theme}>
          <ClusterTagsDialog
            open={open}
            cluster="my-cluster"
            clusterInfo={info}
            onClose={vi.fn()}
          />
        </ThemeProvider>
      </TestContext>
    );
    const { rerender } = render(dialog(clusterInfo));
    await userEvent.clear(screen.getByRole('textbox', { name: 'Tag value' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Tag value' }), 'draft');
    rerender(dialog(JSON.parse(JSON.stringify(clusterInfo))));
    expect(screen.getByRole('textbox', { name: 'Tag value' })).toHaveValue('draft');
    rerender(
      dialog({
        ...clusterInfo,
        meta_data: { extensions: { headlamp_info: { tags: { env: 'updated' } } } },
      })
    );
    expect(screen.getByRole('textbox', { name: 'Tag value' })).toHaveValue('updated');
    rerender(dialog(clusterInfo, false));
    rerender(dialog(clusterInfo));
    expect(screen.getByRole('textbox', { name: 'Tag value' })).toHaveValue('prod');
  });

  it('reloads context tags when an override is removed without changing metadata', async () => {
    const info: Cluster = {
      name: 'my-cluster',
      auth_type: '',
      meta_data: { extensions: { headlamp_info: { tags: { env: 'context' } } } },
    };
    storeClusterSettings('my-cluster', { tags: { env: 'override' } });
    render(
      <TestContext>
        <ThemeProvider theme={theme}>
          <ClusterTagsDialog open cluster="my-cluster" clusterInfo={info} onClose={vi.fn()} />
        </ThemeProvider>
      </TestContext>
    );
    await userEvent.clear(screen.getByRole('textbox', { name: 'Tag key' }));
    act(() => {
      storeClusterSettings('my-cluster', {});
      window.dispatchEvent(new StorageEvent('storage', { key: 'cluster_settings.my-cluster' }));
    });
    expect(screen.getByRole('textbox', { name: 'Tag key' })).toHaveValue('env');
    expect(screen.getByRole('textbox', { name: 'Tag value' })).toHaveValue('context');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['clusterID', 'server', 'same-ID server', 'same-ID authentication'])(
    'discards old rows when a same-named %s identity changes',
    async field => {
      const info: Cluster = {
        name: 'my-cluster',
        auth_type: '',
        server: 'https://first.example',
        meta_data: {
          source: field === 'server' ? 'dynamic_cluster' : 'kubeconfig',
          clusterID: field === 'server' ? undefined : 'first+cluster',
          extensions: { headlamp_info: { tags: { env: 'saved' } } },
        },
      };
      const content = (clusterInfo: Cluster) => (
        <TestContext>
          <ThemeProvider theme={theme}>
            <ClusterTagsDialog
              open
              cluster="my-cluster"
              clusterInfo={clusterInfo}
              onClose={vi.fn()}
            />
          </ThemeProvider>
        </TestContext>
      );
      const { rerender } = render(content(info));
      await userEvent.clear(screen.getByRole('textbox', { name: 'Tag key' }));
      rerender(
        content({
          ...info,
          server: field.includes('server') ? 'https://second.example' : 'https://first.example',
          auth_type: field === 'same-ID authentication' ? 'oidc' : '',
          meta_data: {
            ...info.meta_data,
            clusterID: field === 'clusterID' ? 'second+cluster' : info.meta_data?.clusterID,
          },
        })
      );
      expect(screen.getByRole('textbox', { name: 'Tag key' })).toHaveValue('env');
      expect(screen.getByRole('textbox', { name: 'Tag value' })).toHaveValue('saved');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    }
  );

  it('drops invalid rows when the saved tag map becomes empty', async () => {
    const clusterInfo: Cluster = {
      name: 'my-cluster',
      auth_type: '',
      meta_data: { extensions: { headlamp_info: { tags: { env: 'prod' } } } },
    };
    const dialog = (info: Cluster) => (
      <TestContext>
        <ThemeProvider theme={theme}>
          <ClusterTagsDialog open cluster="my-cluster" clusterInfo={info} onClose={vi.fn()} />
        </ThemeProvider>
      </TestContext>
    );
    const { rerender } = render(dialog(clusterInfo));
    await userEvent.clear(screen.getByRole('textbox', { name: 'Tag key' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Every tag needs a key');
    rerender(
      dialog({
        ...clusterInfo,
        meta_data: { extensions: { headlamp_info: { tags: {} } } },
      })
    );
    expect(screen.queryByRole('textbox', { name: 'Tag key' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

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
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { storeClusterSettings } from '../../../helpers/clusterSettings';
import { notifyClusterTagsChanged } from '../../../helpers/clusterTags';
import { createMuiTheme } from '../../../lib/themes';
import { TestContext } from '../../../test';
import { ClusterNameEditor } from './ClusterNameEditor';
import { useClusterSettings } from './useClusterSettings';

vi.mock('../../../lib/k8s/api/v1/clusterApi', () => ({
  parseKubeConfig: vi.fn(),
  renameCluster: vi.fn(),
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

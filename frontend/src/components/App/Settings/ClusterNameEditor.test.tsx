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
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeBase64 } from '../../../helpers/base64';
import { createMuiTheme } from '../../../lib/themes';
import { storeStatelessClusterKubeconfig } from '../../../stateless';
import { TestContext } from '../../../test';
import { ClusterNameEditor } from './ClusterNameEditor';
import { useClusterSettings } from './useClusterSettings';

const { mockRenameCluster, mockParseKubeConfig, mockRequest } = vi.hoisted(() => ({
  mockRenameCluster: vi.fn(),
  mockParseKubeConfig: vi.fn(),
  mockRequest: vi.fn(),
}));

vi.mock('../../../lib/k8s/api/v1/clusterApi', () => ({
  renameCluster: mockRenameCluster,
  parseKubeConfig: mockParseKubeConfig,
}));
vi.mock('../../../lib/k8s/api/v1/clusterRequests', () => ({ request: mockRequest }));

const kubeconfigPath = '/home/me/.kube/config';
// The backend builds the ID as `<kubeconfig path>+<context name>`.
const clusterID = `${kubeconfigPath}+minikube`;
const settings = JSON.stringify({ allowedNamespaces: ['watch-demo'] });
const theme = createMuiTheme({ base: 'light', name: 'light' });

/** The editor as the settings page uses it, with the settings kept in localStorage. */
function Editor({ cluster, metaData }: { cluster: string; metaData: object }) {
  const [clusterSettings] = useClusterSettings(cluster);
  return (
    <ClusterNameEditor
      cluster={cluster}
      clusterConf={{ [cluster]: { name: cluster, meta_data: metaData } } as any}
      clusterSettings={clusterSettings}
    />
  );
}

function renameWithEnter(
  name: string,
  cluster = 'mk-renamed',
  metaData: object = { clusterID, source: 'kubeconfig', origin: { kubeconfig: kubeconfigPath } }
) {
  const { container } = render(
    <TestContext>
      <ThemeProvider theme={theme}>
        <Editor cluster={cluster} metaData={metaData} />
      </ThemeProvider>
    </TestContext>
  );
  const input = container.querySelector('input[aria-labelledby="cluster-name-label"]')!;
  fireEvent.change(input, { target: { value: name } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

/** A kubeconfig as Load from KubeConfig stores it in the browser. */
function loadedKubeconfig(contextName: string, customName?: string) {
  const extensions = customName
    ? `
    extensions:
    - name: headlamp_info
      extension:
        customName: ${customName}`
    : '';
  return encodeBase64(`apiVersion: v1
kind: Config
clusters:
- name: ${contextName}
  cluster:
    server: https://${contextName}.example.com
contexts:
- name: ${contextName}
  context:
    cluster: ${contextName}
    user: ${contextName}${extensions}
users:
- name: ${contextName}
  user:
    token: test-token
`);
}

function clearStoredKubeconfigs() {
  return new Promise<void>(resolve => {
    const open = indexedDB.open('kubeconfigs', 1);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('kubeconfigStore')) {
        db.close();
        resolve();
        return;
      }
      const clear = db
        .transaction(['kubeconfigStore'], 'readwrite')
        .objectStore('kubeconfigStore')
        .clear();
      clear.onsuccess = clear.onerror = () => {
        db.close();
        resolve();
      };
    };
    open.onerror = () => resolve();
  });
}

describe('ClusterNameEditor', () => {
  beforeEach(() => {
    localStorage.clear();
    mockRenameCluster.mockReset().mockResolvedValue({ clusters: [] });
    mockParseKubeConfig.mockReset().mockResolvedValue({ clusters: [] });
    mockRequest.mockReset();
    localStorage.setItem('cluster_settings.mk-renamed', settings);
    // The editor reloads the page after a rename, which jsdom can't do.
    vi.stubGlobal('location', { ...window.location, reload: vi.fn() });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await clearStoredKubeconfigs();
  });

  it('moves the settings to the typed name', async () => {
    renameWithEnter('new-name');

    await waitFor(() => expect(localStorage.getItem('cluster_settings.new-name')).toBe(settings));
    expect(localStorage.getItem('cluster_settings.mk-renamed')).toBeNull();
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('moves the settings to the original name when the name is cleared', async () => {
    renameWithEnter('');

    await waitFor(() => expect(localStorage.getItem('cluster_settings.minikube')).toBe(settings));
    expect(localStorage.getItem('cluster_settings.mk-renamed')).toBeNull();
    expect(mockRenameCluster).toHaveBeenCalledWith('mk-renamed', '', 'kubeconfig', clusterID);
    // The original name comes from the cluster ID, so nothing else has to be asked for.
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('leaves nothing under the old name when a loaded kubeconfig is renamed', async () => {
    // A cluster loaded from a kubeconfig file lives in the browser and has no clusterID.
    await storeStatelessClusterKubeconfig(loadedKubeconfig('mk-file'));
    localStorage.setItem('cluster_settings.mk-file', settings);

    renameWithEnter('mk-custom', 'mk-file', { source: 'dynamic_cluster' });

    await waitFor(() => expect(localStorage.getItem('cluster_settings.mk-custom')).toBe(settings));
    // The stored kubeconfig is parsed again after the rename, so let that finish too.
    await waitFor(() => expect(mockParseKubeConfig).toHaveBeenCalled());
    await act(() => new Promise(resolve => setTimeout(resolve, 0)));
    expect(localStorage.getItem('cluster_settings.mk-file')).toBeNull();
  });

  it('uses the DNS friendly context name, like the backend does', async () => {
    // The backend lists the context "team/my app" as "team--my__app".
    await storeStatelessClusterKubeconfig(loadedKubeconfig('team/my app', 'mk-renamed'));

    renameWithEnter('', 'mk-renamed', { source: 'dynamic_cluster' });

    await waitFor(() =>
      expect(localStorage.getItem('cluster_settings.team--my__app')).toBe(settings)
    );
    expect(localStorage.getItem('cluster_settings.mk-renamed')).toBeNull();
    expect(localStorage.getItem('cluster_settings.team/my app')).toBeNull();
  });

  it('moves the settings to the context name when the name of a loaded kubeconfig is cleared', async () => {
    await storeStatelessClusterKubeconfig(loadedKubeconfig('kind-dev', 'mk-renamed'));

    renameWithEnter('', 'mk-renamed', { source: 'dynamic_cluster' });

    await waitFor(() => expect(localStorage.getItem('cluster_settings.kind-dev')).toBe(settings));
    expect(localStorage.getItem('cluster_settings.mk-renamed')).toBeNull();
    expect(mockRenameCluster).toHaveBeenCalledWith('mk-renamed', '', 'dynamic_cluster', '');
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

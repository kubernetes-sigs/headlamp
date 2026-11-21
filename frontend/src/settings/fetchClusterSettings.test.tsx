/*
 * Copyright 2026 The Kubernetes Authors
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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { clusterFetch } from '../lib/k8s/api/v2/fetch';
import { setConfig } from '../redux/configSlice';
import store from '../redux/stores/store';
import { setAdminSettings, setClusterSettings } from './adminSettingsSlice';
import { useClusterDefinedSettings } from './fetchClusterSettings';

vi.mock('../lib/k8s/api/v2/fetch', () => ({ clusterFetch: vi.fn() }));

it('removes saved settings for the old connection and ignores its late refresh', async () => {
  const cluster = 'workload';
  const previousClusters = store.getState().config.clusters;
  const previousSettings = store.getState().adminSettings;
  function selectConnection(revision: string) {
    store.dispatch(
      setConfig({
        clusters: {
          [cluster]: {
            name: cluster,
            auth_type: 'oidc',
            server: 'https://workload.example.test',
            meta_data: {
              discoveryConnectionRevision: revision,
              discoveryOrigin: {
                cluster: 'hub',
                resource: {
                  apiVersion: 'example.test/v1',
                  kind: 'Cluster',
                  namespace: 'default',
                  name: cluster,
                  uid: 'fixture',
                },
              },
            },
          },
        },
      })
    );
  }
  const settingsResponse = (setting: string) =>
    Response.json({ data: { 'settings.json': JSON.stringify({ setting }) } });
  const oldRefresh = Promise.withResolvers<Response>();
  const replacement = Promise.withResolvers<Response>();
  const fetch = vi.mocked(clusterFetch);
  fetch
    .mockResolvedValueOnce(settingsResponse('original value'))
    .mockReturnValueOnce(oldRefresh.promise)
    .mockReturnValueOnce(replacement.promise);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const currentSettings = () => store.getState().adminSettings.clusterSettings[cluster];

  selectConnection('original');
  store.dispatch(
    setAdminSettings({
      ...previousSettings,
      defaults: {},
      sources: { [cluster]: [{ name: 'settings' }] },
    })
  );
  const { unmount } = renderHook(() => useClusterDefinedSettings(), {
    wrapper: ({ children }: PropsWithChildren) => (
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </Provider>
    ),
  });

  try {
    await waitFor(() => expect(currentSettings()).toEqual({ setting: 'original value' }));
    void queryClient.invalidateQueries({ queryKey: ['cluster-defined-settings'] });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    act(() => selectConnection('replacement'));
    await waitFor(() => expect(currentSettings()).toBeUndefined());

    await act(async () => replacement.resolve(settingsResponse('replacement value')));
    await waitFor(() => expect(currentSettings()).toEqual({ setting: 'replacement value' }));
    await act(async () => oldRefresh.resolve(settingsResponse('late original value')));
    expect(currentSettings()).toEqual({ setting: 'replacement value' });
    expect(
      fetch.mock.calls.map(
        ([, options]) => options.expectedDiscoveryConnection?.revision?.split(':')[0]
      )
    ).toEqual(['original', 'original', 'replacement']);
  } finally {
    unmount();
    queryClient.clear();
    store.dispatch(setConfig({ clusters: previousClusters }));
    store.dispatch(
      setAdminSettings({ ...previousSettings, defaults: previousSettings.defaults ?? {} })
    );
    store.dispatch(setClusterSettings(previousSettings.clusterSettings));
  }
});

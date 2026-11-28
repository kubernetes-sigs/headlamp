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

import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import { encodeBase64 } from '../helpers/base64';
import { clusterFetch } from '../lib/k8s/api/v2/fetch';
import { IDENTITY_RESET_EVENT, resetAccessibleNamespaces } from '../lib/queryClient';
import configReducer, { setConfig } from '../redux/configSlice';
import adminSettingsReducer, { setAdminSettings, setClusterSettings } from './adminSettingsSlice';
import {
  fetchAllClusterSettings,
  fetchSource,
  useClusterDefinedSettings,
} from './fetchClusterSettings';

vi.mock('../lib/k8s/api/v2/fetch', () => ({
  clusterFetch: vi.fn(),
}));

describe('fetchSource', () => {
  const clusterName = 'bravo';

  it('correctly decodes UTF-8 text from Secret data', async () => {
    const jsonString = JSON.stringify({
      plugins: { demo: { label: 'café', desc: '🚀 multi-byte' } },
    });
    const encoded = encodeBase64(jsonString);

    vi.mocked(clusterFetch).mockResolvedValueOnce({
      json: async () => ({
        data: {
          'settings.json': encoded,
        },
      }),
    } as any);

    const result = await fetchSource(clusterName, {
      name: 'example-settings',
      type: 'Secret',
      namespace: 'headlamp-tools',
    });

    expect(result).toEqual({
      plugins: {
        demo: {
          label: 'café',
          desc: '🚀 multi-byte',
        },
      },
    });
  });

  it('loads plain UTF-8 text from ConfigMap data', async () => {
    const jsonString = JSON.stringify({ plugins: { demo: { label: 'café' } } });

    vi.mocked(clusterFetch).mockResolvedValueOnce({
      json: async () => ({
        data: {
          'settings.json': jsonString,
        },
      }),
    } as any);

    const result = await fetchSource(clusterName, {
      name: 'example-config',
      type: 'ConfigMap',
      namespace: 'headlamp-tools',
    });

    expect(result).toEqual({
      plugins: {
        demo: {
          label: 'café',
        },
      },
    });
  });

  it('handles standard ASCII Secret settings', async () => {
    const jsonString = JSON.stringify({ timezone: 'UTC' });
    const encoded = btoa(jsonString);

    vi.mocked(clusterFetch).mockResolvedValueOnce({
      json: async () => ({
        data: {
          'settings.json': encoded,
        },
      }),
    } as any);

    const result = await fetchSource(clusterName, {
      name: 'ascii-settings',
      type: 'Secret',
    });

    expect(result).toEqual({ timezone: 'UTC' });
  });

  it('returns null when secret data is missing settings.json', async () => {
    vi.mocked(clusterFetch).mockResolvedValueOnce({
      json: async () => ({
        data: {},
      }),
    } as any);

    const result = await fetchSource(clusterName, {
      name: 'missing-settings',
      type: 'Secret',
    });

    expect(result).toBeNull();
  });

  it('returns null when clusterFetch rejects or fails', async () => {
    vi.mocked(clusterFetch).mockRejectedValueOnce(new Error('Forbidden'));

    const result = await fetchSource(clusterName, {
      name: 'forbidden-settings',
      type: 'Secret',
    });

    expect(result).toBeNull();
  });
});

describe('fetchAllClusterSettings', () => {
  it('loads UTF-8 Secret settings for an explicitly named cluster', async () => {
    const bravoSettings = { plugins: { demo: { label: 'café' } } };
    const encoded = encodeBase64(JSON.stringify(bravoSettings));

    vi.mocked(clusterFetch).mockResolvedValueOnce({
      json: async () => ({
        data: {
          'settings.json': encoded,
        },
      }),
    } as any);

    const result = await fetchAllClusterSettings(
      {
        bravo: [{ name: 'example-settings', type: 'Secret', namespace: 'headlamp-tools' }],
      },
      ['bravo']
    );

    expect(result).toEqual({
      bravo: {
        plugins: {
          demo: {
            label: 'café',
          },
        },
      },
    });
  });

  describe('useClusterDefinedSettings', () => {
    it('clears stale settings in a custom provider while replacement fetches are pending', async () => {
      const customStore = configureStore({
        reducer: { adminSettings: adminSettingsReducer, config: configReducer },
      });
      const sources = {
        prod: [{ name: 'private-settings', type: 'ConfigMap', namespace: 'headlamp-tools' }],
      };
      customStore.dispatch(
        setAdminSettings({
          defaults: {},
          display: {},
          clusterDefinedSettings: {},
          clusterDefined: {},
          sources,
        })
      );
      customStore.dispatch(setConfig({ clusters: { prod: {} as any } }));
      customStore.dispatch(setClusterSettings({ prod: { private: true } }));
      const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
      client.setQueryData(['cluster-defined-settings', sources, ['prod']], {
        prod: { private: true },
      });
      let resolveNext!: (value: Response) => void;
      vi.mocked(clusterFetch).mockReturnValueOnce(
        new Promise(resolve => (resolveNext = resolve)) as Promise<Response>
      );
      const wrapper = ({ children }: PropsWithChildren) =>
        createElement(Provider, {
          store: customStore,
          children: createElement(QueryClientProvider, { client, children }),
        });
      renderHook(() => useClusterDefinedSettings(), { wrapper });
      await waitFor(() =>
        expect(customStore.getState().adminSettings.clusterSettings).toEqual({
          prod: { private: true },
        })
      );

      resetAccessibleNamespaces('prod');

      await waitFor(() => expect(customStore.getState().adminSettings.clusterSettings).toEqual({}));
      expect(
        client.getQueryState(['cluster-defined-settings', sources, ['prod']])?.fetchStatus
      ).toBe('fetching');

      resolveNext({
        json: async () => ({
          data: { 'settings.json': JSON.stringify({ private: false }) },
        }),
      } as Response);
      await waitFor(() =>
        expect(customStore.getState().adminSettings.clusterSettings).toEqual({
          prod: { private: false },
        })
      );
    });

    it('applies consecutive cluster resets to the current provider state', async () => {
      const customStore = configureStore({
        reducer: { adminSettings: adminSettingsReducer, config: configReducer },
      });
      customStore.dispatch(setClusterSettings({ prod: { private: true }, dev: { private: true } }));
      const client = new QueryClient();
      const wrapper = ({ children }: PropsWithChildren) =>
        createElement(Provider, {
          store: customStore,
          children: createElement(QueryClientProvider, { client, children }),
        });
      renderHook(() => useClusterDefinedSettings(), { wrapper });

      act(() => {
        window.dispatchEvent(
          new CustomEvent(IDENTITY_RESET_EVENT, { detail: { cluster: 'prod' } })
        );
        window.dispatchEvent(new CustomEvent(IDENTITY_RESET_EVENT, { detail: { cluster: 'dev' } }));
      });

      expect(customStore.getState().adminSettings.clusterSettings).toEqual({});
    });
  });

  it('discards settings resolved for a previous identity', async () => {
    let resolveOld!: (value: Response) => void;
    vi.mocked(clusterFetch).mockReturnValueOnce(
      new Promise(resolve => (resolveOld = resolve)) as Promise<Response>
    );
    const pending = fetchAllClusterSettings(
      { bravo: [{ name: 'private-settings', type: 'ConfigMap' }] },
      ['bravo']
    );

    resetAccessibleNamespaces('bravo');
    resolveOld({
      json: async () => ({
        data: { 'settings.json': JSON.stringify({ private: true }) },
      }),
    } as Response);

    await expect(pending).resolves.toEqual({});
  });

  it('rechecks the first cluster after another cluster finishes', async () => {
    vi.mocked(clusterFetch).mockClear();
    let resolveBravo!: (value: Response) => void;
    let resolveCharlie!: (value: Response) => void;
    vi.mocked(clusterFetch)
      .mockReturnValueOnce(new Promise(resolve => (resolveBravo = resolve)) as Promise<Response>)
      .mockReturnValueOnce(new Promise(resolve => (resolveCharlie = resolve)) as Promise<Response>);
    const pending = fetchAllClusterSettings(
      {
        bravo: [{ name: 'bravo-settings', type: 'ConfigMap' }],
        charlie: [{ name: 'charlie-settings', type: 'ConfigMap' }],
      },
      ['bravo', 'charlie']
    );

    resolveBravo({
      json: async () => ({
        data: { 'settings.json': JSON.stringify({ user: 'old-bravo' }) },
      }),
    } as Response);
    await vi.waitFor(() => expect(vi.mocked(clusterFetch)).toHaveBeenCalledTimes(2));
    resetAccessibleNamespaces('bravo');
    resolveCharlie({
      json: async () => ({
        data: { 'settings.json': JSON.stringify({ user: 'new-charlie' }) },
      }),
    } as Response);

    await expect(pending).resolves.toEqual({ charlie: { user: 'new-charlie' } });
  });
});

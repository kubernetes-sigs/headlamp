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

import { configureStore } from '@reduxjs/toolkit';
import { renderHook } from '@testing-library/react';
import React, { PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { setConfig } from '../redux/configSlice';
import { setPluginSettings } from './pluginsSlice';

const { mockUseSelectedClusters } = vi.hoisted(() => ({
  mockUseSelectedClusters: vi.fn(),
}));

vi.mock('../lib/k8s', () => ({
  useSelectedClusters: mockUseSelectedClusters,
}));

// Imported after the mocks so the module under test picks up the mocked hooks.
import reducers from '../redux/reducers/reducers';
import {
  isPluginApplicable,
  useIsPluginApplicableToCluster,
  usePluginApplicabilityMap,
} from './useIsPluginApplicableToCluster';

function makeStore() {
  return configureStore({ reducer: reducers });
}

function wrapperFor(store: ReturnType<typeof makeStore>) {
  return function Wrapper({ children }: PropsWithChildren<{}>) {
    return <Provider store={store}>{children}</Provider>;
  };
}

function clusterConfig(clusterName: string, labels?: Record<string, string>) {
  return {
    name: clusterName,
    auth_type: '',
    ...(labels !== undefined ? { meta_data: { clusterInventory: { labels } } } : {}),
  };
}

/** Dispatches a real setConfig, exercising the actual configSlice reducer/state shape
 * rather than mocking useClustersConf's return value -- this hook now reads
 * state.config.clusters directly (see useIsPluginApplicableToCluster.ts) specifically so
 * that fresh label data reaches it, so tests should go through the real slice too. */
function setClusters(
  store: ReturnType<typeof makeStore>,
  clusters: Record<string, ReturnType<typeof clusterConfig>>
) {
  store.dispatch(setConfig({ clusters }));
}

describe('useIsPluginApplicableToCluster', () => {
  beforeEach(() => {
    mockUseSelectedClusters.mockReturnValue(['test-cluster']);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns true for a plugin with no clusterSelector', () => {
    const store = makeStore();
    setClusters(store, { 'test-cluster': clusterConfig('test-cluster', { tenant: 'a' }) });
    store.dispatch(
      setPluginSettings([
        {
          name: 'my-plugin',
          description: '',
          homepage: '',
          headlamp: {},
        } as any,
      ])
    );

    const { result } = renderHook(() => useIsPluginApplicableToCluster('my-plugin'), {
      wrapper: wrapperFor(store),
    });

    expect(result.current).toBe(true);
  });

  it('returns true when the selector matches the active cluster labels', () => {
    const store = makeStore();
    setClusters(store, { 'test-cluster': clusterConfig('test-cluster', { tenant: 'a' }) });
    store.dispatch(
      setPluginSettings([
        {
          name: 'my-plugin',
          description: '',
          homepage: '',
          headlamp: { clusterSelector: 'tenant=a' },
        } as any,
      ])
    );

    const { result } = renderHook(() => useIsPluginApplicableToCluster('my-plugin'), {
      wrapper: wrapperFor(store),
    });

    expect(result.current).toBe(true);
  });

  it('returns false when the selector does not match the active cluster labels', () => {
    const store = makeStore();
    setClusters(store, { 'test-cluster': clusterConfig('test-cluster', { tenant: 'a' }) });
    store.dispatch(
      setPluginSettings([
        {
          name: 'my-plugin',
          description: '',
          homepage: '',
          headlamp: { clusterSelector: 'tenant=b' },
        } as any,
      ])
    );

    const { result } = renderHook(() => useIsPluginApplicableToCluster('my-plugin'), {
      wrapper: wrapperFor(store),
    });

    expect(result.current).toBe(false);
  });

  it('returns true (permissive) when the active cluster has no labels', () => {
    const store = makeStore();
    setClusters(store, { 'test-cluster': clusterConfig('test-cluster') });
    store.dispatch(
      setPluginSettings([
        {
          name: 'my-plugin',
          description: '',
          homepage: '',
          headlamp: { clusterSelector: 'tenant=a' },
        } as any,
      ])
    );

    const { result } = renderHook(() => useIsPluginApplicableToCluster('my-plugin'), {
      wrapper: wrapperFor(store),
    });

    expect(result.current).toBe(true);
  });

  it('returns true (permissive) when no cluster is selected', () => {
    mockUseSelectedClusters.mockReturnValue([]);

    const store = makeStore();
    store.dispatch(
      setPluginSettings([
        {
          name: 'my-plugin',
          description: '',
          homepage: '',
          headlamp: { clusterSelector: 'tenant=a' },
        } as any,
      ])
    );

    const { result } = renderHook(() => useIsPluginApplicableToCluster('my-plugin'), {
      wrapper: wrapperFor(store),
    });

    expect(result.current).toBe(true);
  });

  it('returns true for a null plugin name (unattributed contribution)', () => {
    const store = makeStore();
    setClusters(store, { 'test-cluster': clusterConfig('test-cluster', { tenant: 'a' }) });
    store.dispatch(
      setPluginSettings([
        {
          name: 'my-plugin',
          description: '',
          homepage: '',
          headlamp: { clusterSelector: 'tenant=b' },
        } as any,
      ])
    );

    const { result } = renderHook(() => useIsPluginApplicableToCluster(null), {
      wrapper: wrapperFor(store),
    });

    expect(result.current).toBe(true);
  });

  it('returns true for an undefined plugin name', () => {
    const store = makeStore();

    const { result } = renderHook(() => useIsPluginApplicableToCluster(undefined), {
      wrapper: wrapperFor(store),
    });

    expect(result.current).toBe(true);
  });

  it('returns true for a plugin name absent from pluginSettings', () => {
    const store = makeStore();

    const { result } = renderHook(() => useIsPluginApplicableToCluster('unknown-plugin'), {
      wrapper: wrapperFor(store),
    });

    expect(result.current).toBe(true);
  });
});

describe('usePluginApplicabilityMap', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('maps each plugin to its applicability to the active cluster', () => {
    mockUseSelectedClusters.mockReturnValue(['test-cluster']);
    const store = makeStore();
    setClusters(store, { 'test-cluster': clusterConfig('test-cluster', { tenant: 'a' }) });
    store.dispatch(
      setPluginSettings([
        {
          name: 'matching-plugin',
          description: '',
          homepage: '',
          headlamp: { clusterSelector: 'tenant=a' },
        } as any,
        {
          name: 'non-matching-plugin',
          description: '',
          homepage: '',
          headlamp: { clusterSelector: 'tenant=b' },
        } as any,
        {
          name: 'unscoped-plugin',
          description: '',
          homepage: '',
        } as any,
      ])
    );

    const { result } = renderHook(() => usePluginApplicabilityMap(), {
      wrapper: wrapperFor(store),
    });

    expect(result.current.get('matching-plugin')).toBe(true);
    expect(result.current.get('non-matching-plugin')).toBe(false);
    expect(result.current.get('unscoped-plugin')).toBe(true);
  });

  it('ignores an overridden (isLoaded: false) variant of a plugin name', () => {
    // pluginSettings can hold multiple entries for the same name once
    // applyPluginPriority runs (dev/user/shipped variants) -- only the loaded one
    // should determine that plugin's applicability.
    mockUseSelectedClusters.mockReturnValue(['test-cluster']);
    const store = makeStore();
    setClusters(store, { 'test-cluster': clusterConfig('test-cluster', { tenant: 'a' }) });
    store.dispatch(
      setPluginSettings([
        {
          name: 'my-plugin',
          description: '',
          homepage: '',
          type: 'shipped',
          isLoaded: false,
          overriddenBy: 'user',
          headlamp: { clusterSelector: 'tenant=b' },
        } as any,
        {
          name: 'my-plugin',
          description: '',
          homepage: '',
          type: 'user',
          isLoaded: true,
          headlamp: { clusterSelector: 'tenant=a' },
        } as any,
      ])
    );

    const { result } = renderHook(() => usePluginApplicabilityMap(), {
      wrapper: wrapperFor(store),
    });

    // Only the loaded ('user') variant's selector should apply; if the overridden
    // ('shipped') entry were allowed to win, this would be false instead.
    expect(result.current.get('my-plugin')).toBe(true);
  });

  describe('multi-cluster (aggregate) pages', () => {
    beforeEach(() => {
      mockUseSelectedClusters.mockReturnValue(['cluster-a', 'cluster-b']);
    });

    it('applies (union) when the selector matches at least one selected cluster', () => {
      const store = makeStore();
      setClusters(store, {
        'cluster-a': clusterConfig('cluster-a', { tenant: 'a' }),
        'cluster-b': clusterConfig('cluster-b', { tenant: 'b' }),
      });
      store.dispatch(
        setPluginSettings([
          {
            name: 'my-plugin',
            description: '',
            homepage: '',
            headlamp: { clusterSelector: 'tenant=a' },
          } as any,
        ])
      );

      const { result } = renderHook(() => usePluginApplicabilityMap(), {
        wrapper: wrapperFor(store),
      });

      expect(result.current.get('my-plugin')).toBe(true);
    });

    it('does not apply when the selector matches neither selected cluster', () => {
      const store = makeStore();
      setClusters(store, {
        'cluster-a': clusterConfig('cluster-a', { tenant: 'a' }),
        'cluster-b': clusterConfig('cluster-b', { tenant: 'b' }),
      });
      store.dispatch(
        setPluginSettings([
          {
            name: 'my-plugin',
            description: '',
            homepage: '',
            headlamp: { clusterSelector: 'tenant=c' },
          } as any,
        ])
      );

      const { result } = renderHook(() => usePluginApplicabilityMap(), {
        wrapper: wrapperFor(store),
      });

      expect(result.current.get('my-plugin')).toBe(false);
    });

    it('applies (permissive) when one selected cluster has no labels, even if the other does not match', () => {
      const store = makeStore();
      setClusters(store, {
        'cluster-a': clusterConfig('cluster-a'), // no labels at all
        'cluster-b': clusterConfig('cluster-b', { tenant: 'b' }),
      });
      store.dispatch(
        setPluginSettings([
          {
            name: 'my-plugin',
            description: '',
            homepage: '',
            headlamp: { clusterSelector: 'tenant=z' },
          } as any,
        ])
      );

      const { result } = renderHook(() => usePluginApplicabilityMap(), {
        wrapper: wrapperFor(store),
      });

      // cluster-a has no labels -> permissive match for it -> union is true, even
      // though cluster-b's labels don't match the selector.
      expect(result.current.get('my-plugin')).toBe(true);
    });
  });
});

describe('isPluginApplicable', () => {
  const map = new Map([
    ['matching-plugin', true],
    ['non-matching-plugin', false],
  ]);

  it('returns true for a null plugin name', () => {
    expect(isPluginApplicable(map, null)).toBe(true);
  });

  it('returns true for an undefined plugin name', () => {
    expect(isPluginApplicable(map, undefined)).toBe(true);
  });

  it('returns true for a plugin name absent from the map', () => {
    expect(isPluginApplicable(map, 'unknown-plugin')).toBe(true);
  });

  it('returns true for a plugin mapped to true', () => {
    expect(isPluginApplicable(map, 'matching-plugin')).toBe(true);
  });

  it('returns false for a plugin mapped to false', () => {
    expect(isPluginApplicable(map, 'non-matching-plugin')).toBe(false);
  });
});

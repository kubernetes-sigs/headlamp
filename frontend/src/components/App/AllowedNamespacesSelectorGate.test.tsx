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

import { act, fireEvent, render, screen } from '@testing-library/react';
import { Suspense, useEffect, useLayoutEffect, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  loadResolvedAllowedNamespaces,
  storeClusterSettings,
  storeResolvedAllowedNamespaces,
} from '../../helpers/clusterSettings';
import { AllowedNamespacesSelectorContext } from '../../lib/k8s/allowedNamespacesContext';
import { ApiError } from '../../lib/k8s/api/v2/ApiError';
import { KubeObject } from '../../lib/k8s/KubeObject';
import AllowedNamespacesSelectorGate, {
  AllowedNamespacesSelectorProvider,
} from './AllowedNamespacesSelectorGate';
import { useClusterSettings } from './Settings/useClusterSettings';

const { namespaceLists } = vi.hoisted(() => ({ namespaceLists: vi.fn() }));
vi.mock('../../lib/k8s/namespace', () => ({
  default: { useList: namespaceLists },
}));
vi.mock('../../lib/k8s/accessibleNamespaces', () => ({
  shouldDiscoverNamespaces: vi.fn(() => false),
  useAccessibleNamespaces: vi.fn(() => ({ isPending: false, namespaces: undefined })),
}));
vi.mock('../../redux/hooks', () => ({
  useTypedSelector: vi.fn(() => false),
}));

class PanelResource extends KubeObject {
  static apiVersion = 'v1';
  static apiName = 'pods';
  static kind = 'Pod';
  static isNamespaced = true;
}

function recordPanelStreams() {
  const streams: Array<{
    namespace?: string;
    deliver: (items: PanelResource[]) => void;
    fail?: (error: ApiError, cluster?: string) => void;
    cancel: ReturnType<typeof vi.fn>;
  }> = [];
  vi.spyOn(PanelResource, 'apiList').mockImplementation((deliver, fail, options) => () => {
    const cancel = vi.fn();
    streams.push({ namespace: options?.namespace, deliver, fail, cancel });
    return Promise.resolve(cancel);
  });
  return streams;
}

function fireStorageEvent(key: string | null) {
  const event = new StorageEvent('storage', { key });
  // The test storage is not a native jsdom Storage.
  Object.defineProperty(event, 'storageArea', { value: localStorage });
  window.dispatchEvent(event);
}

describe('allowed namespace resolution for plugin consumers', () => {
  beforeEach(() => {
    localStorage.clear();
    namespaceLists.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('keeps the initial gate but preserves mounted form state during selector refresh', () => {
    function Form() {
      const [name, setName] = useState('');
      const [yaml, setYaml] = useState('');
      return (
        <>
          <input
            aria-label="Project Name"
            value={name}
            onChange={event => setName(event.target.value)}
          />
          <textarea
            aria-label="Loaded YAML"
            value={yaml}
            onChange={event => setYaml(event.target.value)}
          />
        </>
      );
    }
    function Harness() {
      const [waiting, setWaiting] = useState(true);
      return (
        <AllowedNamespacesSelectorContext.Provider
          value={{ waiting, registerCluster: () => () => {} }}
        >
          <button onClick={() => setWaiting(false)}>Resolve selector</button>
          <button onClick={() => setWaiting(true)}>Refresh selector</button>
          <AllowedNamespacesSelectorGate>
            <Form />
          </AllowedNamespacesSelectorGate>
        </AllowedNamespacesSelectorContext.Provider>
      );
    }
    render(<Harness />);
    expect(screen.queryByRole('textbox', { name: 'Project Name' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resolve selector' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Project Name' }), {
      target: { value: 'keep project name' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Loaded YAML' }), {
      target: { value: 'kind: ConfigMap' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Refresh selector' }));

    expect(screen.getByRole('textbox', { name: 'Project Name' })).toHaveValue('keep project name');
    expect(screen.getByRole('textbox', { name: 'Loaded YAML' })).toHaveValue('kind: ConfigMap');
    fireEvent.click(screen.getByRole('button', { name: 'Resolve selector' }));
    expect(screen.getByRole('textbox', { name: 'Project Name' })).toHaveValue('keep project name');
    expect(screen.getByRole('textbox', { name: 'Loaded YAML' })).toHaveValue('kind: ConfigMap');
  });

  it.each([
    { cluster: 'selected', outsideGate: true, cached: false },
    { cluster: 'remote', outsideGate: false, cached: false },
    { cluster: 'remote', outsideGate: false, cached: true },
  ])(
    'updates a $cluster consumer (outside gate: $outsideGate, cached: $cached)',
    async ({ cluster, outsideGate, cached }) => {
      storeClusterSettings(cluster, { allowedNamespacesSelector: 'team=frontend' });
      if (cached) {
        storeResolvedAllowedNamespaces(cluster, 'team=frontend', ['stale']);
      }
      type NamespaceData = { metadata: { name: string } };
      let updateNamespaces!: (items: NamespaceData[]) => void;
      namespaceLists.mockImplementation(function useNamespaceList({
        clusters,
      }: {
        clusters: string[];
      }) {
        const [items, setItems] = useState<NamespaceData[] | null>(null);
        const requestCluster = clusters[0];
        useEffect(() => {
          if (requestCluster === cluster) {
            updateNamespaces = setItems;
          }
        }, [requestCluster]);
        return { items, error: null, isError: false, isFetching: items === null };
      });

      const streams = recordPanelStreams();
      const onList = vi.fn();
      function Panel() {
        PanelResource.useApiList(onList, undefined, { cluster });
        return <span>plugin panel</span>;
      }

      render(
        <MemoryRouter>
          <AllowedNamespacesSelectorProvider clusters={['selected']}>
            {outsideGate && <Panel />}
            <AllowedNamespacesSelectorGate>
              {!outsideGate && <Panel />}
              <span>route content</span>
            </AllowedNamespacesSelectorGate>
          </AllowedNamespacesSelectorProvider>
        </MemoryRouter>
      );

      expect(screen.getByText('plugin panel')).toBeInTheDocument();
      expect(streams.map(stream => stream.namespace)).toEqual(cached ? ['stale'] : []);
      if (outsideGate) {
        expect(screen.queryByText('route content')).not.toBeInTheDocument();
      } else {
        expect(screen.getByText('route content')).toBeInTheDocument();
      }

      act(() => updateNamespaces([{ metadata: { name: 'ns-a' } }]));

      expect(screen.getByText('route content')).toBeInTheDocument();
      expect(namespaceLists).toHaveBeenCalledWith(
        expect.objectContaining({ clusters: [cluster], labelSelector: 'team=frontend' })
      );
      expect(streams.map(stream => stream.namespace)).toEqual(
        cached ? ['stale', 'ns-a'] : ['ns-a']
      );
      const activeStream = streams[streams.length - 1];
      const resource = new PanelResource({ metadata: { name: 'allowed', namespace: 'ns-a' } });
      act(() => activeStream.deliver([resource]));
      expect(onList).toHaveBeenLastCalledWith([resource]);

      await act(async () => updateNamespaces([]));

      expect(activeStream.cancel).toHaveBeenCalledTimes(1);
      expect(onList).toHaveBeenLastCalledWith([]);
      const callsAfterEmpty = onList.mock.calls.length;
      act(() => activeStream.deliver([resource]));
      expect(onList).toHaveBeenCalledTimes(callsAfterEmpty);
      expect(streams.every(stream => Boolean(stream.namespace))).toBe(true);
    }
  );

  it('updates a mounted remote panel when the settings editor applies and removes a selector', async () => {
    namespaceLists.mockImplementation(({ labelSelector }: { labelSelector?: string }) => ({
      items: labelSelector ? [] : null,
      error: null,
      isError: false,
      isFetching: false,
    }));
    const streams = recordPanelStreams();
    const onList = vi.fn();
    const mounted = vi.fn();
    const unmounted = vi.fn();
    function Panel() {
      PanelResource.useApiList(onList, undefined, { cluster: 'remote' });
      useEffect(() => {
        mounted();
        return unmounted;
      }, []);
      return <span>persistent panel</span>;
    }
    function Editor() {
      const [, setSettings] = useClusterSettings('remote');
      return (
        <button
          onClick={() =>
            setSettings(settings =>
              settings.allowedNamespacesSelector ? {} : { allowedNamespacesSelector: 'team=none' }
            )
          }
        >
          Toggle selector
        </button>
      );
    }
    render(
      <MemoryRouter>
        <AllowedNamespacesSelectorProvider clusters={['selected']}>
          <Panel />
          <Editor />
        </AllowedNamespacesSelectorProvider>
      </MemoryRouter>
    );
    expect(streams).toHaveLength(1);
    expect(streams[0].namespace).toBeUndefined();
    const resource = new PanelResource({ metadata: { name: 'initial', namespace: 'ns-a' } });
    act(() => streams[0].deliver([resource]));
    expect(onList).toHaveBeenLastCalledWith([resource]);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Toggle selector' }));
    });

    expect(namespaceLists).toHaveBeenCalledWith(
      expect.objectContaining({ clusters: ['remote'], labelSelector: 'team=none' })
    );
    expect(streams[0].cancel).toHaveBeenCalledTimes(1);
    expect(onList).toHaveBeenLastCalledWith([]);
    expect(streams).toHaveLength(1);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Toggle selector' }));
    });

    expect(streams).toHaveLength(2);
    expect(streams[1].namespace).toBeUndefined();
    act(() => streams[1].deliver([resource]));
    expect(onList).toHaveBeenLastCalledWith([resource]);
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(unmounted).not.toHaveBeenCalled();
  });

  it.each(['selected', 'remote'])(
    'publishes an asynchronous repeated selector result for a %s consumer',
    async cluster => {
      const selector = 'team=frontend';
      storeClusterSettings(cluster, { allowedNamespacesSelector: selector });
      type NamespaceData = { metadata: { name: string } };
      let resolveNamespaces!: (items: NamespaceData[] | null) => void;
      namespaceLists.mockImplementation(function useNamespaceList({
        clusters,
        labelSelector,
      }: {
        clusters: string[];
        labelSelector?: string;
      }) {
        const [items, setItems] = useState<NamespaceData[] | null>(null);
        const requestCluster = clusters[0];
        useEffect(() => {
          if (requestCluster === cluster) {
            resolveNamespaces = setItems;
          }
        }, [requestCluster]);
        return {
          items: labelSelector ? items : null,
          error: null,
          isError: false,
          isFetching: items === null,
        };
      });
      const streams = recordPanelStreams();
      const onList = vi.fn();
      function Panel() {
        PanelResource.useApiList(onList, undefined, { cluster });
        return <span>persistent panel</span>;
      }
      render(
        <MemoryRouter>
          <AllowedNamespacesSelectorProvider clusters={['selected']}>
            <Panel />
            <AllowedNamespacesSelectorGate>
              <span>resolved route</span>
            </AllowedNamespacesSelectorGate>
          </AllowedNamespacesSelectorProvider>
        </MemoryRouter>
      );
      await act(async () => resolveNamespaces([{ metadata: { name: 'ns-a' } }]));
      expect(streams.map(stream => stream.namespace)).toEqual(['ns-a']);
      expect(screen.getByText('resolved route')).toBeInTheDocument();

      await act(async () => storeClusterSettings(cluster, {}));
      expect(loadResolvedAllowedNamespaces(cluster)).toBeNull();
      expect(streams.map(stream => stream.namespace)).toEqual(['ns-a', undefined]);
      act(() => resolveNamespaces(null));
      await act(async () => storeClusterSettings(cluster, { allowedNamespacesSelector: selector }));
      expect(onList).toHaveBeenLastCalledWith([]);
      expect(screen.getByText('resolved route')).toBeInTheDocument();

      await act(async () => resolveNamespaces([{ metadata: { name: 'ns-a' } }]));

      expect(screen.getByText('resolved route')).toBeInTheDocument();
      expect(streams.map(stream => stream.namespace)).toEqual(['ns-a', undefined, 'ns-a']);
      const resource = new PanelResource({ metadata: { name: 'fresh', namespace: 'ns-a' } });
      act(() => streams[2].deliver([resource]));
      expect(onList).toHaveBeenLastCalledWith([resource]);
    }
  );

  it('clears and reconnects a mounted panel after settings and clear events from another tab', async () => {
    namespaceLists.mockImplementation(({ labelSelector }: { labelSelector?: string }) => ({
      items: labelSelector ? [] : null,
      error: null,
      isError: false,
      isFetching: false,
    }));
    const streams = recordPanelStreams();
    const onList = vi.fn();
    function Panel() {
      PanelResource.useApiList(onList, undefined, { cluster: 'remote' });
      return <span>persistent panel</span>;
    }
    render(
      <MemoryRouter>
        <AllowedNamespacesSelectorProvider clusters={[]}>
          <Panel />
        </AllowedNamespacesSelectorProvider>
      </MemoryRouter>
    );
    const resource = new PanelResource({ metadata: { name: 'initial', namespace: 'ns-a' } });
    act(() => streams[0].deliver([resource]));

    await act(async () => {
      localStorage.setItem(
        'cluster_settings.remote',
        JSON.stringify({ allowedNamespacesSelector: 'team=none' })
      );
      fireStorageEvent('cluster_settings.remote');
    });

    expect(onList).toHaveBeenLastCalledWith([]);
    expect(streams[0].cancel).toHaveBeenCalledTimes(1);
    expect(streams).toHaveLength(1);

    await act(async () => {
      localStorage.clear();
      fireStorageEvent(null);
    });

    expect(streams).toHaveLength(2);
    expect(streams[1].namespace).toBeUndefined();
    const callsBeforeOldStream = onList.mock.calls.length;
    act(() => streams[0].deliver([resource]));
    expect(onList).toHaveBeenCalledTimes(callsBeforeOldStream);
    act(() => streams[1].deliver([resource]));
    expect(onList).toHaveBeenLastCalledWith([resource]);
  });

  it.each(['selected', 'remote'])(
    'recovers a %s consumer after a cache-only storage event with stable query results',
    async cluster => {
      storeClusterSettings(cluster, { allowedNamespacesSelector: 'team=frontend' });
      const items = [{ metadata: { name: 'ns-a' } }];
      namespaceLists.mockImplementation(({ labelSelector }: { labelSelector?: string }) => ({
        items: labelSelector ? items : null,
        error: null,
        isError: false,
        isFetching: false,
      }));
      const streams = recordPanelStreams();
      const onList = vi.fn();
      function Panel() {
        PanelResource.useApiList(onList, undefined, { cluster });
        return <span>persistent panel</span>;
      }
      render(
        <MemoryRouter>
          <AllowedNamespacesSelectorProvider clusters={['selected']}>
            <Panel />
            <AllowedNamespacesSelectorGate>
              <span>resolved route</span>
            </AllowedNamespacesSelectorGate>
          </AllowedNamespacesSelectorProvider>
        </MemoryRouter>
      );
      expect(screen.getByText('resolved route')).toBeInTheDocument();
      expect(streams[streams.length - 1].namespace).toBe('ns-a');

      await act(async () => {
        const key = `cluster_allowed_namespaces_selector_cache.${cluster}`;
        localStorage.removeItem(key);
        fireStorageEvent(key);
      });

      expect(loadResolvedAllowedNamespaces(cluster)?.namespaces).toEqual(['ns-a']);
      expect(screen.getByText('resolved route')).toBeInTheDocument();
      expect(streams[streams.length - 1].namespace).toBe('ns-a');
      const resource = new PanelResource({ metadata: { name: 'fresh', namespace: 'ns-a' } });
      act(() => streams[streams.length - 1].deliver([resource]));
      expect(onList).toHaveBeenLastCalledWith([resource]);
    }
  );

  it('updates a mounted editor and panel after a cross-tab selector edit without stale publications', async () => {
    storeClusterSettings('remote', { allowedNamespacesSelector: 'team=frontend' });
    storeResolvedAllowedNamespaces('remote', 'team=frontend', ['ns-a']);
    const initialItems = [{ metadata: { name: 'ns-a' } }];
    const currentItems = [{ metadata: { name: 'ns-b' } }];
    const staleItems = [{ metadata: { name: 'stale' } }];
    const oldQueryUpdates: Array<(result: 'success' | 'error') => void> = [];
    namespaceLists.mockImplementation(function useNamespaceList({
      labelSelector,
    }: {
      labelSelector?: string;
    }) {
      const [lateResult, setLateResult] = useState<'success' | 'error' | null>(null);
      useEffect(() => {
        if (labelSelector === 'team=frontend') {
          oldQueryUpdates.push(setLateResult);
        }
      }, [labelSelector]);
      if (labelSelector === 'team=backend') {
        return { items: currentItems, error: null, isError: false, isFetching: false };
      }
      const error = lateResult === 'error' ? new ApiError('old selector error') : null;
      return {
        items:
          labelSelector && !error ? (lateResult === 'success' ? staleItems : initialItems) : null,
        error,
        isError: Boolean(error),
        isFetching: false,
      };
    });
    const streams = recordPanelStreams();
    const onList = vi.fn();
    const panelUnmounted = vi.fn();
    function Panel() {
      PanelResource.useApiList(onList, undefined, { cluster: 'remote' });
      useEffect(() => panelUnmounted, []);
      return <span>persistent panel</span>;
    }
    function Editor() {
      const [settings] = useClusterSettings('remote');
      return <span>{`editor selector: ${settings.allowedNamespacesSelector}`}</span>;
    }
    render(
      <MemoryRouter>
        <AllowedNamespacesSelectorProvider clusters={['selected']}>
          <Panel />
          <Editor />
        </AllowedNamespacesSelectorProvider>
      </MemoryRouter>
    );
    expect(screen.getByText('editor selector: team=frontend')).toBeInTheDocument();

    await act(async () => {
      localStorage.setItem(
        'cluster_settings.remote',
        JSON.stringify({ allowedNamespacesSelector: 'team=backend' })
      );
      fireStorageEvent('cluster_settings.remote');
    });

    expect(screen.getByText('editor selector: team=backend')).toBeInTheDocument();
    expect(loadResolvedAllowedNamespaces('remote')).toEqual(
      expect.objectContaining({ selector: 'team=backend', namespaces: ['ns-b'] })
    );
    const requestCount = streams.length;
    await act(async () => oldQueryUpdates.forEach(update => update('success')));
    await act(async () => oldQueryUpdates.forEach(update => update('error')));
    expect(loadResolvedAllowedNamespaces('remote')).toEqual(
      expect.objectContaining({ selector: 'team=backend', namespaces: ['ns-b'] })
    );
    expect(streams).toHaveLength(requestCount);
    const resource = new PanelResource({ metadata: { name: 'fresh', namespace: 'ns-b' } });
    act(() => streams[streams.length - 1].deliver([resource]));
    expect(onList).toHaveBeenLastCalledWith([resource]);
    expect(panelUnmounted).not.toHaveBeenCalled();
  });

  it('rejects results and errors when a selector resolves empty while the consumer is suspended', async () => {
    storeClusterSettings('remote', { allowedNamespacesSelector: 'team=frontend' });
    storeResolvedAllowedNamespaces('remote', 'team=frontend', ['ns-a']);
    type NamespaceData = { metadata: { name: string } };
    let updateNamespaces!: (items: NamespaceData[]) => void;
    namespaceLists.mockImplementation(function useNamespaceList() {
      const [items, setItems] = useState<NamespaceData[]>([{ metadata: { name: 'ns-a' } }]);
      useEffect(() => {
        updateNamespaces = setItems;
      }, []);
      return { items, error: null, isError: false, isFetching: false };
    });
    const streams = recordPanelStreams();
    const onList = vi.fn();
    const onError = vi.fn();
    const detached = vi.fn();
    let reveal!: () => void;
    const pending = new Promise<void>(resolve => {
      reveal = resolve;
    });
    let suspended = false;
    function Panel() {
      PanelResource.useApiList(onList, onError, { cluster: 'remote' });
      useLayoutEffect(() => detached, []);
      if (suspended) {
        throw pending;
      }
      return <span>visible panel</span>;
    }
    const tree = () => (
      <MemoryRouter>
        <AllowedNamespacesSelectorProvider clusters={[]}>
          <Suspense fallback="hidden panel">
            <Panel />
          </Suspense>
        </AllowedNamespacesSelectorProvider>
      </MemoryRouter>
    );
    const view = render(tree());
    expect(streams).toHaveLength(1);

    suspended = true;
    view.rerender(tree());
    expect(screen.getByText('hidden panel')).toBeInTheDocument();
    expect(detached).toHaveBeenCalledTimes(1);
    await act(async () => updateNamespaces([]));
    expect(loadResolvedAllowedNamespaces('remote')?.namespaces).toEqual([]);
    expect(streams[0].cancel).not.toHaveBeenCalled();

    const callsBeforeLateCallbacks = onList.mock.calls.length;
    const resource = new PanelResource({ metadata: { name: 'stale', namespace: 'ns-a' } });
    act(() => {
      streams[0].deliver([resource]);
      streams[0].fail?.(new ApiError('late failure'), 'remote');
    });
    expect(onList).toHaveBeenCalledTimes(callsBeforeLateCallbacks);
    expect(onError).not.toHaveBeenCalled();

    suspended = false;
    await act(async () => {
      reveal();
      await pending;
    });
    expect(screen.getByText('visible panel')).toBeInTheDocument();
    expect(onList).toHaveBeenLastCalledWith([]);
    expect(streams[0].cancel).toHaveBeenCalledTimes(1);
    expect(streams).toHaveLength(1);
  });

  it('unregisters a prototype-named cluster after its last consumer unmounts', () => {
    storeClusterSettings('constructor', { allowedNamespacesSelector: 'team=frontend' });
    storeResolvedAllowedNamespaces('constructor', 'team=frontend', ['ns-a']);
    const resolverStopped = vi.fn();
    namespaceLists.mockImplementation(function useNamespaceList() {
      useEffect(() => resolverStopped, []);
      return { items: null, error: null, isError: false, isFetching: true };
    });
    recordPanelStreams();
    function Panel() {
      PanelResource.useApiList(vi.fn(), undefined, { cluster: 'constructor' });
      return null;
    }
    const tree = (consumers: number) => (
      <MemoryRouter>
        <AllowedNamespacesSelectorProvider clusters={[]}>
          {Array.from({ length: consumers }, (_, index) => (
            <Panel key={index} />
          ))}
        </AllowedNamespacesSelectorProvider>
      </MemoryRouter>
    );
    const view = render(tree(2));
    expect(namespaceLists).toHaveBeenCalledWith(
      expect.objectContaining({ clusters: ['constructor'] })
    );

    view.rerender(tree(1));
    expect(resolverStopped).not.toHaveBeenCalled();

    view.rerender(tree(0));
    expect(resolverStopped).toHaveBeenCalledTimes(1);
  });
});

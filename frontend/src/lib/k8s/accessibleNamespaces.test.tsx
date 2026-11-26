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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { PropsWithChildren, useState } from 'react';
import AllowedNamespacesSelectorGate, {
  AllowedNamespacesSelectorProvider,
} from '../../components/App/AllowedNamespacesSelectorGate';
import {
  getCombinedAllowedNamespaces,
  getDiscoveredNamespaces,
  hasAllowedNamespacesRestriction,
  resetDiscoveredNamespaces,
  setDiscoveredNamespaces,
  storeClusterSettings,
} from '../../helpers/clusterSettings';
import { setConfig } from '../../redux/configSlice';
import store from '../../redux/stores/store';
import { TestContext } from '../../test';
import {
  IDENTITY_RESET_CHANNEL,
  queryClient as appQueryClient,
  resetAccessibleNamespaces,
} from '../queryClient';
import {
  ACCESSIBLE_NAMESPACES_REFRESH_MS,
  accessibleNamespacesQueryOptions,
  useAccessibleNamespaces,
} from './accessibleNamespaces';
import { ApiError } from './api/v2/ApiError';
import { clusterFetch } from './api/v2/fetch';

// The backend endpoint is the external dependency; everything else is real.
vi.mock('./api/v2/fetch', () => ({
  clusterFetch: vi.fn(),
}));

const mockClusterFetch = clusterFetch as unknown as ReturnType<typeof vi.fn>;

function respond(body: unknown) {
  mockClusterFetch.mockResolvedValue({ json: () => Promise.resolve(body) });
}

function setDiscoveryEnabled(enabled: boolean) {
  store.dispatch(setConfig({ clusters: {}, namespaceDiscoveryEnabled: enabled }));
}

function makeWrapper(
  queryClient = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  })
) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <TestContext>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </TestContext>
    );
  };
}

describe('useAccessibleNamespaces', () => {
  beforeEach(() => {
    localStorage.clear();
    setDiscoveredNamespaces('prod', null);
    mockClusterFetch.mockReset();
    setDiscoveryEnabled(true);
  });

  it('does nothing when the backend does not enable discovery', () => {
    setDiscoveryEnabled(false);

    const { result } = renderHook(() => useAccessibleNamespaces('prod'), {
      wrapper: makeWrapper(),
    });

    expect(mockClusterFetch).not.toHaveBeenCalled();
    expect(result.current).toEqual({ isPending: false, namespaces: undefined });
    expect(hasAllowedNamespacesRestriction('prod')).toBe(false);
  });

  it('skips discovery when namespaces are configured in the cluster settings', () => {
    storeClusterSettings('prod', { allowedNamespaces: ['manual'] });

    renderHook(() => useAccessibleNamespaces('prod'), { wrapper: makeWrapper() });

    expect(mockClusterFetch).not.toHaveBeenCalled();
    expect(getCombinedAllowedNamespaces('prod')).toEqual(['manual']);
  });

  it('restricts the cluster to the discovered namespaces', async () => {
    respond({ status: 'restricted', namespaces: ['team-b', 'team-a'] });

    const { result } = renderHook(() => useAccessibleNamespaces('prod'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.namespaces).toEqual(['team-a', 'team-b']));
    expect(mockClusterFetch).toHaveBeenCalledWith('accessible-namespaces', { cluster: 'prod' });
    expect(getCombinedAllowedNamespaces('prod')).toEqual(['team-a', 'team-b']);
    expect(hasAllowedNamespacesRestriction('prod')).toBe(true);
  });

  it('keeps the restriction when the user can access no namespace', async () => {
    respond({ status: 'restricted', namespaces: [] });

    const { result } = renderHook(() => useAccessibleNamespaces('prod'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.namespaces).toEqual([]));
    expect(hasAllowedNamespacesRestriction('prod')).toBe(true);
  });

  it.each(['all', 'unsupported'])('drops the restriction for status %s', async status => {
    setDiscoveredNamespaces('prod', ['stale']);
    respond({ status, namespaces: [] });

    const { result } = renderHook(() => useAccessibleNamespaces('prod'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isPending).toBe(false));
    await waitFor(() => expect(getDiscoveredNamespaces('prod')).toBeUndefined());
    expect(hasAllowedNamespacesRestriction('prod')).toBe(false);
  });

  it('does not retry auth errors and falls back to the previous behaviour', async () => {
    mockClusterFetch.mockRejectedValue(new ApiError('Unauthorized', { status: 401 }));

    const { result } = renderHook(() => useAccessibleNamespaces('prod'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(mockClusterFetch).toHaveBeenCalledTimes(1);
    expect(result.current.namespaces).toBeUndefined();
    expect(hasAllowedNamespacesRestriction('prod')).toBe(false);
  });
});

describe('useAccessibleNamespaces across refreshes and identity changes', () => {
  beforeEach(() => {
    localStorage.clear();
    setDiscoveredNamespaces('prod', null);
    mockClusterFetch.mockReset();
    setDiscoveryEnabled(true);
  });

  it('drops the restriction when a refetch fails after a success', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
    respond({ status: 'restricted', namespaces: ['team-a'] });

    const { result } = renderHook(() => useAccessibleNamespaces('prod'), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(getDiscoveredNamespaces('prod')).toEqual(['team-a']));

    mockClusterFetch.mockRejectedValue(new ApiError('Unauthorized', { status: 401 }));
    await act(() => queryClient.refetchQueries({ queryKey: ['accessibleNamespaces'] }));

    await waitFor(() => expect(result.current.namespaces).toBeUndefined());
    expect(getDiscoveredNamespaces('prod')).toBeUndefined();
    expect(hasAllowedNamespacesRestriction('prod')).toBe(false);
  });

  it('refreshes periodically and does not retry auth errors', () => {
    const options = accessibleNamespacesQueryOptions('prod', 3, true);

    expect(options.queryKey).toEqual(['accessibleNamespaces', 'prod', 3]);
    expect(options.refetchInterval).toBe(ACCESSIBLE_NAMESPACES_REFRESH_MS);
    expect(ACCESSIBLE_NAMESPACES_REFRESH_MS).toBe(60 * 1000);
    expect(options.retry(0, new ApiError('Unauthorized', { status: 401 }))).toBe(false);
    expect(options.retry(0, new ApiError('Bad Gateway', { status: 502 }))).toBe(true);
    expect(options.retry(1, new ApiError('Bad Gateway', { status: 502 }))).toBe(false);
  });

  it('ignores a response for the previous identity after a reset', async () => {
    let resolveOld: (value: unknown) => void = () => {};
    mockClusterFetch.mockReturnValueOnce(
      new Promise(resolve => {
        resolveOld = resolve;
      })
    );

    const { result } = renderHook(() => useAccessibleNamespaces('prod'), {
      wrapper: makeWrapper(),
    });
    expect(result.current.isPending).toBe(true);

    // The identity changes while the first request is still in flight.
    respond({ status: 'restricted', namespaces: ['new-user-ns'] });
    act(() => resetDiscoveredNamespaces('prod'));

    await waitFor(() => expect(getDiscoveredNamespaces('prod')).toEqual(['new-user-ns']));

    await act(async () => {
      resolveOld({
        json: () => Promise.resolve({ status: 'restricted', namespaces: ['old-user-ns'] }),
      });
    });

    expect(getDiscoveredNamespaces('prod')).toEqual(['new-user-ns']);
    expect(result.current.namespaces).toEqual(['new-user-ns']);
  });
});

describe('resetAccessibleNamespaces', () => {
  afterEach(() => {
    appQueryClient.clear();
    setDiscoveredNamespaces('prod', null);
    setDiscoveredNamespaces('dev', null);
  });

  it('clears discovered namespaces and cached results for one cluster', () => {
    setDiscoveredNamespaces('prod', ['team-a']);
    setDiscoveredNamespaces('dev', ['team-b']);
    appQueryClient.setQueryData(['accessibleNamespaces', 'prod', 0], { status: 'all' });
    appQueryClient.setQueryData(['accessibleNamespaces', 'dev', 0], { status: 'all' });

    resetAccessibleNamespaces('prod');

    expect(getDiscoveredNamespaces('prod')).toBeUndefined();
    expect(getDiscoveredNamespaces('dev')).toEqual(['team-b']);
    expect(appQueryClient.getQueryData(['accessibleNamespaces', 'prod', 0])).toBeUndefined();
    expect(appQueryClient.getQueryData(['accessibleNamespaces', 'dev', 0])).toBeDefined();
  });

  it('clears every cluster without an argument (OIDC token broadcast)', () => {
    setDiscoveredNamespaces('prod', ['team-a']);
    setDiscoveredNamespaces('dev', ['team-b']);

    resetAccessibleNamespaces();

    expect(getDiscoveredNamespaces('prod')).toBeUndefined();
    expect(getDiscoveredNamespaces('dev')).toBeUndefined();
  });
});

describe('identity reset in another tab', () => {
  beforeEach(() => {
    localStorage.clear();
    setDiscoveredNamespaces('prod', null);
    mockClusterFetch.mockReset();
    setDiscoveryEnabled(true);
  });

  afterEach(() => {
    appQueryClient.clear();
    setDiscoveredNamespaces('prod', null);
  });

  it('drops discovered namespaces and ignores an in-flight response of the old identity', async () => {
    let resolveOld!: (value: unknown) => void;
    mockClusterFetch.mockReturnValueOnce(new Promise(resolve => (resolveOld = resolve)));
    const { result } = renderHook(() => useAccessibleNamespaces('prod'), {
      wrapper: makeWrapper(),
    });
    expect(result.current.isPending).toBe(true);

    // Another tab (a second BroadcastChannel instance) switches the user.
    respond({ status: 'restricted', namespaces: ['new-user-ns'] });
    const otherTab = new BroadcastChannel(IDENTITY_RESET_CHANNEL);
    otherTab.postMessage({ cluster: 'prod' });
    otherTab.close();

    await waitFor(() => expect(result.current.namespaces).toEqual(['new-user-ns']));

    // The response of the previous user arrives late and must not be applied.
    await act(async () => {
      resolveOld({
        json: () => Promise.resolve({ status: 'restricted', namespaces: ['old-user-ns'] }),
      });
    });
    expect(result.current.namespaces).toEqual(['new-user-ns']);
    expect(getDiscoveredNamespaces('prod')).toEqual(['new-user-ns']);
  });
});

describe('AllowedNamespacesSelectorGate with namespace discovery', () => {
  beforeEach(() => {
    localStorage.clear();
    setDiscoveredNamespaces('prod', null);
    mockClusterFetch.mockReset();
    setDiscoveryEnabled(true);
  });

  function NamespacesProbe() {
    return <div>allowed: {getCombinedAllowedNamespaces('prod').join(',')}</div>;
  }

  it('renders children only after discovery resolved, with the discovered namespaces', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    mockClusterFetch.mockReturnValue(
      new Promise(resolve => {
        resolveFetch = resolve;
      })
    );

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <AllowedNamespacesSelectorProvider clusters={['prod']}>
          <AllowedNamespacesSelectorGate>
            <NamespacesProbe />
          </AllowedNamespacesSelectorGate>
        </AllowedNamespacesSelectorProvider>
      </Wrapper>
    );

    expect(screen.queryByText(/allowed:/)).not.toBeInTheDocument();

    resolveFetch({
      json: () => Promise.resolve({ status: 'restricted', namespaces: ['team-a'] }),
    });

    expect(await screen.findByText('allowed: team-a')).toBeInTheDocument();
  });

  it('waits again for the new identity after an auth reset', async () => {
    respond({ status: 'restricted', namespaces: ['team-a'] });

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <AllowedNamespacesSelectorProvider clusters={['prod']}>
          <AllowedNamespacesSelectorGate>
            <NamespacesProbe />
          </AllowedNamespacesSelectorGate>
        </AllowedNamespacesSelectorProvider>
      </Wrapper>
    );
    expect(await screen.findByText('allowed: team-a')).toBeInTheDocument();

    let resolveNew: (value: unknown) => void = () => {};
    mockClusterFetch.mockReturnValue(
      new Promise(resolve => {
        resolveNew = resolve;
      })
    );
    act(() => resetDiscoveredNamespaces('prod'));

    await waitFor(() => expect(screen.queryByText(/allowed:/)).not.toBeInTheDocument());

    resolveNew({
      json: () => Promise.resolve({ status: 'restricted', namespaces: ['team-b'] }),
    });
    expect(await screen.findByText('allowed: team-b')).toBeInTheDocument();
  });

  it('rejects discovery readiness from a previous generation after reselection', async () => {
    respond({ status: 'restricted', namespaces: ['team-a'] });

    function Harness() {
      const [selected, setSelected] = useState(true);
      return (
        <>
          <button onClick={() => setSelected(value => !value)}>Toggle cluster</button>
          <AllowedNamespacesSelectorProvider clusters={selected ? ['prod'] : []}>
            <AllowedNamespacesSelectorGate>
              <NamespacesProbe />
            </AllowedNamespacesSelectorGate>
          </AllowedNamespacesSelectorProvider>
        </>
      );
    }

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <Harness />
      </Wrapper>
    );
    expect(await screen.findByText('allowed: team-a')).toBeInTheDocument();

    await act(async () => screen.getByRole('button', { name: 'Toggle cluster' }).click());
    act(() => resetDiscoveredNamespaces('prod'));
    mockClusterFetch.mockReturnValue(new Promise(() => {}));
    await act(async () => screen.getByRole('button', { name: 'Toggle cluster' }).click());

    expect(screen.queryByText(/allowed:/)).not.toBeInTheDocument();
  });

  it('does not wait for discovery when the backend does not enable it', () => {
    setDiscoveryEnabled(false);

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <AllowedNamespacesSelectorProvider clusters={['prod']}>
          <AllowedNamespacesSelectorGate>
            <NamespacesProbe />
          </AllowedNamespacesSelectorGate>
        </AllowedNamespacesSelectorProvider>
      </Wrapper>
    );

    expect(screen.getByText(/allowed:/)).toBeInTheDocument();
    expect(mockClusterFetch).not.toHaveBeenCalled();
  });
});

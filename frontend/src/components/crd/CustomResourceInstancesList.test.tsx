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
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { ApiError } from '../../lib/k8s/api/v2/ApiError';
import * as apiFetch from '../../lib/k8s/api/v2/fetch';
import { WebSocketManager } from '../../lib/k8s/api/v2/multiplexer';
import CustomResourceDefinition from '../../lib/k8s/crd';
import { KubeObject } from '../../lib/k8s/KubeObject';
import { TestContext } from '../../test';
import { ClusterGroupErrorMessage } from '../cluster/ClusterGroupErrorMessage';
import { CrInstanceList } from './CustomResourceInstancesList';

vi.mock('../../lib/k8s/crd', () => ({
  default: {
    useList: vi.fn(),
  },
}));

vi.mock('../../redux/filterSlice', async importOriginal => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    useNamespaces: () => [] as string[],
  };
});

vi.mock('react-i18next', async importOriginal => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, values: Record<string, unknown> = {}) =>
        Object.entries(values).reduce(
          (text, [name, value]) => text.replace(`{{ ${name} }}`, String(value)),
          key.split('|').pop() ?? key
        ),
    }),
  };
});

// Mock heavy presentational components so the test focuses on branch logic
// rather than re-rendering MUI/theme internals.
vi.mock('../common/', async importOriginal => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    Loader: ({ title }: { title: string }) => <div data-testid="mock-loader">{title}</div>,
    ResourceListView: ({
      title,
      errorMessage,
      data,
      errors,
      watchErrors,
    }: {
      title: string;
      errorMessage?: string;
      data: Array<Record<string, any>>;
      errors?: ApiError[];
      watchErrors?: ApiError[];
    }) => (
      <div data-testid="mock-resource-list-view">
        <span data-testid="rlv-title">{title}</span>
        <span data-testid="rlv-row-count">{data?.length ?? 0}</span>
        {data?.map(item => (
          <span key={item.metadata.name}>{item.metadata.name}</span>
        ))}
        <ClusterGroupErrorMessage errors={errors} watchErrors={watchErrors} />
        {errorMessage ? <span data-testid="rlv-error-message">{errorMessage}</span> : null}
      </div>
    ),
  };
});

// The empty state's Refresh action needs a QueryClient; stub it so these
// tests stay focused on which branch renders.
vi.mock('../common/Resource/EmptyStateActions', () => ({
  EmptyStateActions: () => <div data-testid="mock-empty-state-actions" />,
}));

interface QueryResult {
  items?: Array<Record<string, any>> | null;
  clusterResults?: Record<string, unknown>;
  error?: ApiError | null;
  errors?: ApiError[] | null;
  watchErrors?: ApiError[];
  isLoading?: boolean;
  isFetching?: boolean;
  isError?: boolean;
}

function makeMockCrd(name: string, queryResult: QueryResult, crdClass?: typeof KubeObject) {
  const useList = vi.fn(() => ({
    items: queryResult.items ?? null,
    clusterResults: queryResult.items ? { 'test-cluster': queryResult } : {},
    error: queryResult.error ?? null,
    errors: queryResult.errors ?? null,
    watchErrors: queryResult.watchErrors,
    isLoading: queryResult.isLoading ?? false,
    isFetching: queryResult.isFetching ?? false,
    isError: queryResult.isError ?? false,
  }));
  return {
    cluster: 'test-cluster',
    metadata: { name, namespace: 'default' },
    jsonData: { status: { acceptedNames: { categories: [] } } },
    makeCRClassOrNull: () => crdClass ?? { useList },
  };
}

function setOuterCrdsList(
  crds: ReturnType<typeof makeMockCrd>[] | null,
  state: Omit<QueryResult, 'items'> = {}
) {
  (CustomResourceDefinition.useList as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    items: crds,
    clusterResults: crds ? { 'test-cluster': { items: crds } } : {},
    error: null,
    isLoading: false,
    ...state,
  });
}

function renderList() {
  return render(
    <TestContext>
      <CrInstanceList />
    </TestContext>
  );
}

describe('CrInstanceList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['isLoading', 'isFetching'] as const)(
    'keeps the initial definitions loader when items is empty and %s has no snapshot',
    state => {
      setOuterCrdsList([], { clusterResults: {}, [state]: true });
      renderList();
      expect(screen.getByTestId('mock-loader')).toHaveTextContent(
        'Loading custom resource definitions'
      );
      expect(screen.queryByText('No custom resources instances found.')).not.toBeInTheDocument();
    }
  );

  describe('real instance LIST snapshots', () => {
    class Widget extends KubeObject {
      static kind = 'Widget';
      static apiName = 'widgets';
      static apiVersion = 'example.com/v1';
      static isNamespaced = true;
    }

    function renderRealList(crds: ReturnType<typeof makeMockCrd>[]) {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'true');
      vi.spyOn(WebSocketManager, 'subscribe').mockResolvedValue(() => {});
      setOuterCrdsList(crds);
      const view = render(
        <QueryClientProvider client={client}>
          <TestContext>
            <CrInstanceList />
          </TestContext>
        </QueryClientProvider>
      );
      onTestFinished(async () => {
        view.unmount();
        await client.cancelQueries();
        client.clear();
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
      });
      return client;
    }

    it('keeps the loader for a pending initial LIST and blocks when all initial LISTs fail', async () => {
      const pending = Promise.withResolvers<Response>();
      vi.spyOn(apiFetch, 'clusterFetch').mockImplementation((_url, options) =>
        options.cluster === 'pending-cluster'
          ? pending.promise
          : Promise.reject(new ApiError('Initial LIST forbidden', { status: 403 }))
      );
      const client = renderRealList([
        makeMockCrd('widgets.example.com', {}, Widget),
        { ...makeMockCrd('widgets.example.com', {}, Widget), cluster: 'pending-cluster' },
      ]);

      await waitFor(() => expect(client.isFetching()).toBe(1));
      expect(screen.getByTestId('mock-loader')).toHaveTextContent(
        'Loading custom resource instances'
      );
      expect(screen.queryByText('No custom resources instances found.')).not.toBeInTheDocument();

      act(() => pending.reject(new ApiError('Other initial LIST forbidden', { status: 403 })));
      expect(await screen.findByText('Failed to load custom resource instances')).toBeVisible();
      expect(screen.queryByTestId('mock-loader')).not.toBeInTheDocument();
      expect(screen.queryByText('No custom resources instances found.')).not.toBeInTheDocument();
    });

    it('does not present a loaded empty CRD and another pending initial LIST as a complete empty result', async () => {
      const pending = Promise.withResolvers<Response>();
      vi.spyOn(apiFetch, 'clusterFetch').mockImplementation((_url, options) =>
        options.cluster === 'pending-cluster'
          ? pending.promise
          : Promise.resolve(
              new Response(
                JSON.stringify({
                  kind: 'WidgetList',
                  apiVersion: 'example.com/v1',
                  metadata: { resourceVersion: '1' },
                  items: [],
                })
              )
            )
      );
      const client = renderRealList([
        makeMockCrd('widgets.example.com', {}, Widget),
        { ...makeMockCrd('widgets.example.com', {}, Widget), cluster: 'pending-cluster' },
      ]);

      await waitFor(() => expect(client.isFetching()).toBe(1));
      expect(screen.getByTestId('mock-loader')).toHaveTextContent(
        'Loading custom resource instances'
      );
      expect(screen.queryByText('No custom resources instances found.')).not.toBeInTheDocument();
      act(() =>
        pending.resolve(
          new Response(
            JSON.stringify({
              kind: 'WidgetList',
              apiVersion: 'example.com/v1',
              metadata: { resourceVersion: '2' },
              items: [],
            })
          )
        )
      );
      expect(await screen.findByText('No custom resources instances found.')).toBeVisible();
      expect(screen.queryByTestId('mock-loader')).not.toBeInTheDocument();
    });

    it('keeps a successfully loaded empty snapshot through a pending and failed real LIST', async () => {
      const refresh = Promise.withResolvers<Response>();
      vi.spyOn(apiFetch, 'clusterFetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              kind: 'WidgetList',
              apiVersion: 'example.com/v1',
              metadata: { resourceVersion: '1' },
              items: [],
            })
          )
        )
        .mockReturnValueOnce(refresh.promise);
      const client = renderRealList([makeMockCrd('widgets.example.com', {}, Widget)]);
      expect(await screen.findByText('No custom resources instances found.')).toBeVisible();

      act(() => {
        void client.refetchQueries({ queryKey: ['kubeObject', 'list'] });
      });
      await waitFor(() => expect(client.isFetching()).toBe(1));
      expect(screen.getByText('No custom resources instances found.')).toBeVisible();
      expect(screen.queryByTestId('mock-loader')).not.toBeInTheDocument();

      act(() => refresh.reject(new ApiError('Refresh forbidden', { status: 403 })));
      expect(
        await screen.findByText("You don't have permissions to view this resource")
      ).toBeVisible();
      expect(screen.getByText('No custom resources instances found.')).toBeVisible();
      expect(
        screen.queryByText('Failed to load custom resource instances')
      ).not.toBeInTheDocument();
      expect(screen.getByTestId('mock-empty-state-actions')).toBeInTheDocument();
    });
  });

  it('renders a loader while instance lists are loading without a snapshot', () => {
    const loadingCrd = makeMockCrd('foo.example.com', { isLoading: true });
    setOuterCrdsList([loadingCrd]);

    renderList();

    expect(screen.getByTestId('mock-loader')).toHaveTextContent(
      'Loading custom resource instances'
    );
  });

  it('renders a loader while another namespace is loading after an empty snapshot', () => {
    setOuterCrdsList([
      makeMockCrd('foo.example.com', {
        items: [],
        isLoading: true,
      }),
    ]);

    renderList();

    expect(screen.getByTestId('mock-loader')).toHaveTextContent(
      'Loading custom resource instances'
    );
    expect(screen.queryByText('No custom resources instances found.')).not.toBeInTheDocument();
  });

  it('renders the empty state when no CRD has any instances', () => {
    const crdA = makeMockCrd('foo.example.com', { items: [] });
    const crdB = makeMockCrd('bar.example.com', { items: [] });
    setOuterCrdsList([crdA, crdB]);

    renderList();

    expect(screen.getByText('No custom resources instances found.')).toBeInTheDocument();
    expect(screen.getByTestId('mock-empty-state-actions')).toBeInTheDocument();
  });

  it('renders a blocking error when every CRD list failed without a snapshot', () => {
    const crdA = makeMockCrd('foo.example.com', { isError: true });
    const crdB = makeMockCrd('bar.example.com', { isError: true });
    setOuterCrdsList([crdA, crdB]);

    renderList();

    expect(screen.getByText('Failed to load custom resource instances')).toBeInTheDocument();
    expect(screen.queryByText('No custom resources instances found.')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-resource-list-view')).not.toBeInTheDocument();
  });

  it('renders the partial-failure warning alert when only some CRDs errored out', () => {
    const failingCrd = makeMockCrd('failing.example.com', { isError: true });
    const okCrd = makeMockCrd('ok.example.com', {
      items: [
        {
          kind: 'OkResource',
          metadata: { name: 'ok-instance-1', namespace: 'default' },
          cluster: 'test-cluster',
        },
      ],
    });
    setOuterCrdsList([failingCrd, okCrd]);

    renderList();

    expect(screen.getByText('Failed to load custom resource instances')).toBeInTheDocument();
    expect(screen.getByText(/failing\.example\.com/)).toBeInTheDocument();
    expect(screen.getByTestId('rlv-row-count')).toHaveTextContent('1');
  });

  it('renders instances and skips the warning alert on the happy path', () => {
    const crd = makeMockCrd('happy.example.com', {
      items: [
        {
          kind: 'HappyResource',
          metadata: { name: 'happy-instance-1', namespace: 'default' },
          cluster: 'test-cluster',
        },
        {
          kind: 'HappyResource',
          metadata: { name: 'happy-instance-2', namespace: 'default' },
          cluster: 'test-cluster',
        },
      ],
    });
    setOuterCrdsList([crd]);

    renderList();

    expect(screen.queryByText('Failed to load custom resource instances')).not.toBeInTheDocument();
    expect(screen.getByTestId('rlv-row-count')).toHaveTextContent('2');
  });

  it.each([false, true])(
    'retains an instance snapshot through pending and failed refresh (empty: %s)',
    empty => {
      const items = empty
        ? []
        : [{ kind: 'CachedResource', metadata: { name: 'cached-instance' } }];
      const state: QueryResult = { items };
      setOuterCrdsList([makeMockCrd('cached.example.com', state)]);
      const view = renderList();
      const expectSnapshot = () => {
        expect(screen.queryByTestId('mock-loader')).not.toBeInTheDocument();
        expect(screen.queryByTestId('rlv-error-message')).not.toBeInTheDocument();
        expect(
          screen.getByText(empty ? 'No custom resources instances found.' : 'cached-instance')
        ).toBeInTheDocument();
      };
      expectSnapshot();

      const warning = new ApiError('Instance watch reconnecting');
      Object.assign(state, { isFetching: true, watchErrors: [warning] });
      view.rerender(
        <TestContext>
          <CrInstanceList />
        </TestContext>
      );
      expectSnapshot();
      expect(screen.getByRole('alert')).toHaveTextContent(warning.message);

      Object.assign(state, {
        isFetching: false,
        isError: true,
        errors: [new ApiError('Instance refresh forbidden', { status: 403 })],
        watchErrors: [],
      });
      view.rerender(
        <TestContext>
          <CrInstanceList />
        </TestContext>
      );
      expectSnapshot();
      expect(screen.getByText("You don't have permissions to view this resource")).toBeVisible();
    }
  );

  it('keeps available rows while another instance list has no snapshot yet', () => {
    setOuterCrdsList([
      makeMockCrd('cached.example.com', {
        items: [{ kind: 'CachedResource', metadata: { name: 'cached-instance' } }],
      }),
      makeMockCrd('pending.example.com', { isLoading: true }),
    ]);

    renderList();

    expect(screen.getByText('cached-instance')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-loader')).not.toBeInTheDocument();
  });

  it.each([false, true])(
    'retains cached definitions through pending and failed refresh (empty: %s)',
    empty => {
      const crds = empty
        ? []
        : [
            makeMockCrd('cached.example.com', {
              items: [{ kind: 'CachedResource', metadata: { name: 'cached-instance' } }],
            }),
          ];
      const warning = new ApiError('Definitions watch reconnecting');
      setOuterCrdsList(crds, { isFetching: true, watchErrors: [warning] });
      const view = renderList();
      const expectSnapshot = () => {
        expect(screen.queryByTestId('mock-loader')).not.toBeInTheDocument();
        expect(
          screen.getByText(empty ? 'No custom resources instances found.' : 'cached-instance')
        ).toBeInTheDocument();
      };
      expectSnapshot();
      expect(screen.getByRole('alert')).toHaveTextContent(warning.message);

      const error = new ApiError('Definitions refresh forbidden', { status: 403 });
      setOuterCrdsList(crds, { error, errors: [error], isError: true });
      view.rerender(
        <TestContext>
          <CrInstanceList />
        </TestContext>
      );
      expectSnapshot();
      expect(screen.getByRole('alert')).toHaveTextContent(
        "You don't have permissions to view this resource"
      );
      expect(
        screen.queryByText(/Error getting custom resource definitions/)
      ).not.toBeInTheDocument();

      setOuterCrdsList(crds);
      view.rerender(
        <TestContext>
          <CrInstanceList />
        </TestContext>
      );
      expectSnapshot();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    }
  );

  it('blocks on the initial definition fetch only while no snapshot exists', () => {
    setOuterCrdsList(null, { isLoading: true });
    const view = renderList();
    expect(screen.getByTestId('mock-loader')).toHaveTextContent(
      'Loading custom resource definitions'
    );

    setOuterCrdsList(null, {
      error: new ApiError('Definitions unavailable'),
      isError: true,
    });
    view.rerender(
      <TestContext>
        <CrInstanceList />
      </TestContext>
    );
    expect(screen.queryByTestId('mock-loader')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-resource-list-view')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Error getting custom resource definitions:.*Definitions unavailable/)
    ).toBeInTheDocument();
  });

  it('keeps loading definitions while another cluster is pending', () => {
    setOuterCrdsList([], { isLoading: true });

    renderList();

    expect(screen.getByTestId('mock-loader')).toHaveTextContent(
      'Loading custom resource definitions'
    );
    expect(screen.queryByText('No custom resources instances found.')).not.toBeInTheDocument();
  });

  it('skips CRDs whose makeCRClassOrNull returns null without crashing (#4824)', () => {
    const incompleteCrd = {
      cluster: 'test-cluster',
      metadata: { name: 'incomplete.example.com', namespace: 'default' },
      jsonData: { status: { acceptedNames: { categories: [] } } },
      makeCRClassOrNull: () => null,
    } as unknown as ReturnType<typeof makeMockCrd>;
    const okCrd = makeMockCrd('ok.example.com', {
      items: [
        {
          kind: 'OkResource',
          metadata: { name: 'ok-instance-1', namespace: 'default' },
          cluster: 'test-cluster',
        },
      ],
    });

    setOuterCrdsList([incompleteCrd, okCrd]);

    renderList();

    expect(screen.getByTestId('rlv-row-count')).toHaveTextContent('1');
    expect(screen.queryByText('Failed to load custom resource instances')).not.toBeInTheDocument();
  });
});

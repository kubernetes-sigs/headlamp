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

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CustomResourceDefinition from '../../lib/k8s/crd';
import { TestContext } from '../../test';
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
      t: (key: string) => key.split('|').pop() ?? key,
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
    }: {
      title: string;
      errorMessage?: string;
      data: Array<Record<string, any>>;
    }) => (
      <div data-testid="mock-resource-list-view">
        <span data-testid="rlv-title">{title}</span>
        <span data-testid="rlv-row-count">{data?.length ?? 0}</span>
        {errorMessage ? <span data-testid="rlv-error-message">{errorMessage}</span> : null}
      </div>
    ),
  };
});

interface QueryResult {
  items?: Array<Record<string, any>>;
  isLoading?: boolean;
  isFetching?: boolean;
  isError?: boolean;
}

function makeMockCrd(name: string, queryResult: QueryResult) {
  const useList = vi.fn(() => ({
    items: queryResult.items ?? [],
    isLoading: queryResult.isLoading ?? false,
    isFetching: queryResult.isFetching ?? false,
    isError: queryResult.isError ?? false,
  }));
  return {
    cluster: 'test-cluster',
    metadata: { name, namespace: 'default' },
    jsonData: { status: { acceptedNames: { categories: [] } } },
    makeCRClass: () => ({ useList }),
  };
}

function setOuterCrdsList(crds: ReturnType<typeof makeMockCrd>[]) {
  (CustomResourceDefinition.useList as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    items: crds,
    error: null,
    isLoading: false,
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

  it('renders a loader while any CRD instance list is loading', () => {
    const loadingCrd = makeMockCrd('foo.example.com', { isLoading: true });
    const readyCrd = makeMockCrd('bar.example.com', { items: [] });
    setOuterCrdsList([loadingCrd, readyCrd]);

    renderList();

    expect(screen.getByTestId('mock-loader')).toHaveTextContent(
      'Loading custom resource instances'
    );
  });

  it('renders the empty state when no CRD has any instances', () => {
    const crdA = makeMockCrd('foo.example.com', { items: [] });
    const crdB = makeMockCrd('bar.example.com', { items: [] });
    setOuterCrdsList([crdA, crdB]);

    renderList();

    expect(screen.getByText('No custom resources instances found.')).toBeInTheDocument();
  });

  it('renders the empty state when every CRD list errored out (all-failed)', () => {
    const crdA = makeMockCrd('foo.example.com', { isError: true });
    const crdB = makeMockCrd('bar.example.com', { isError: true });
    setOuterCrdsList([crdA, crdB]);

    renderList();

    expect(screen.getByText('No custom resources instances found.')).toBeInTheDocument();
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
});

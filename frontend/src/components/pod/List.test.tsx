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

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type Pod from '../../lib/k8s/pod';
import PodList, { PodListRenderer } from './List';

const { mockNamespaces, mockPodMetricsUseList, mockPodUseList, mockTranslation } = vi.hoisted(
  () => ({
    mockNamespaces: new Set(['default']),
    mockPodMetricsUseList: vi.fn(() => ({ items: null, loadMore: undefined })),
    mockPodUseList: vi.fn(() => ({
      errors: null,
      hasMore: false,
      items: null,
      loadMore: undefined,
      remainingItemCount: 0,
    })),
    mockTranslation: vi.fn((key: string, values?: Record<string, string>) => {
      const label = key.split('|').at(-1)!;
      return Object.entries(values ?? {}).reduce(
        (result, [name, value]) => result.replace(`{{ ${name} }}`, value),
        label
      );
    }),
  })
);

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockTranslation }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../lib/k8s/pod', () => ({
  default: class Pod {
    static useList = mockPodUseList;
  },
}));

vi.mock('../../lib/k8s/PodMetrics', () => ({
  METRIC_REFETCH_INTERVAL_MS: 30_000,
  PodMetrics: class PodMetrics {
    static useList = mockPodMetricsUseList;
  },
}));

vi.mock('../../redux/filterSlice', async importOriginal => ({
  ...(await importOriginal<typeof import('../../redux/filterSlice')>()),
  useLabelSelector: () => 'environment=production',
  useNamespaces: () => mockNamespaces,
}));

vi.mock('../../redux/headlampEventSlice', async importOriginal => ({
  ...(await importOriginal<typeof import('../../redux/headlampEventSlice')>()),
  useEventCallback: () => vi.fn(),
}));

vi.mock('../common', () => ({
  CreateResourceButton: () => null,
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => (
    <>
      <div data-testid="title-side-actions">{props.headerProps?.titleSideActions}</div>
      <div data-testid="header-actions">{props.headerProps?.actions}</div>
    </>
  ),
}));

vi.mock('../common/Resource/ResourceTable', () => ({
  useThrottle: (value: unknown) => value,
}));

describe('PodListRenderer', () => {
  it('shows loaded counts and disables load more while a page is loading', async () => {
    let finishLoading!: () => void;
    const onLoadMore = vi.fn(() => new Promise<void>(resolve => (finishLoading = resolve)));

    render(
      <PodListRenderer
        pods={[{} as Pod]}
        metrics={null}
        hideCreateButton
        hasMore
        remainingItemCount={4}
        onLoadMore={onLoadMore}
      />
    );

    expect(screen.getByTestId('title-side-actions')).toBeEmptyDOMElement();
    expect(screen.getByText('1 of ~5')).toBeVisible();
    const headerActions = screen.getByTestId('header-actions');
    expect(headerActions).toContainElement(screen.getByText('1 of ~5'));

    const button = screen.getByRole('button', { name: 'Load more' });
    expect(headerActions).toContainElement(button);
    expect(mockTranslation).toHaveBeenCalledWith('glossary|Load more');

    fireEvent.click(button);

    expect(onLoadMore).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();
    expect(mockTranslation).toHaveBeenCalledWith('translation|Loading...');

    finishLoading();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled());
  });
});

describe('PodList', () => {
  it('keeps Pod and PodMetrics selector pagination aligned', () => {
    render(<PodList />);

    expect(mockPodUseList).toHaveBeenCalledWith({
      labelSelector: 'environment=production',
      limit: 1000,
      namespace: mockNamespaces,
    });
    expect(mockPodMetricsUseList).toHaveBeenCalledWith({
      labelSelector: 'environment=production',
      limit: 1000,
      namespace: mockNamespaces,
      refetchInterval: 30_000,
    });
  });
});

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
import { PodListRenderer } from './List';

const { mockTranslation } = vi.hoisted(() => ({
  mockTranslation: vi.fn((key: string, values?: Record<string, string>) => {
    const label = key.split('|').at(-1)!;
    return Object.entries(values ?? {}).reduce(
      (result, [name, value]) => result.replace(`{{ ${name} }}`, value),
      label
    );
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockTranslation }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../lib/k8s/pod', () => ({
  default: class Pod {},
}));

vi.mock('../../lib/k8s/PodMetrics', () => ({
  METRIC_REFETCH_INTERVAL_MS: 30_000,
  PodMetrics: class PodMetrics {},
}));

vi.mock('../common', () => ({
  CreateResourceButton: () => null,
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => <>{props.headerProps?.titleSideActions}</>,
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

    expect(screen.getByText('1 of ~5')).toBeVisible();
    const button = screen.getByRole('button', { name: 'Load more' });
    expect(mockTranslation).toHaveBeenCalledWith('glossary|Load more');

    fireEvent.click(button);

    expect(onLoadMore).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();
    expect(mockTranslation).toHaveBeenCalledWith('translation|Loading...');

    finishLoading();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled());
  });
});

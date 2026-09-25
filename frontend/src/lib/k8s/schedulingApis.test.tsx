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
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import App from '../../App';
import { useSelectedClusters } from './api/v1/hooks';
import PodGroup from './podGroup';
import { useSchedulingApiClusters, useSchedulingApisEnabled } from './schedulingApis';

vi.mock('./api/v1/hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('./api/v1/hooks')>()),
  useSelectedClusters: vi.fn(),
}));

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('useSchedulingApiClusters', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps only the selected clusters that serve the scheduling APIs', async () => {
    vi.mocked(useSelectedClusters).mockReturnValue(['legacy', 'gang', 'other-gang']);
    vi.spyOn(PodGroup, 'isEnabled').mockImplementation(async cluster => cluster !== 'legacy');

    const { result } = renderHook(() => useSchedulingApiClusters(), { wrapper });

    await waitFor(() => expect(result.current).toEqual(['gang', 'other-gang']));
  });

  it('is empty while nothing is selected, without probing', () => {
    vi.mocked(useSelectedClusters).mockReturnValue([]);
    const isEnabled = vi.spyOn(PodGroup, 'isEnabled');

    const { result } = renderHook(() => useSchedulingApiClusters(), { wrapper });

    expect(result.current).toEqual([]);
    expect(isEnabled).not.toHaveBeenCalled();
  });

  it('is empty when no selected cluster serves the APIs', async () => {
    vi.mocked(useSelectedClusters).mockReturnValue(['legacy']);
    const isEnabled = vi.spyOn(PodGroup, 'isEnabled').mockResolvedValue(false);

    const { result } = renderHook(() => useSchedulingApiClusters(), { wrapper });

    await waitFor(() => expect(isEnabled).toHaveBeenCalledWith('legacy'));
    expect(result.current).toEqual([]);
  });
});

describe('useSchedulingApisEnabled', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is true once any selected cluster serves the APIs', async () => {
    vi.mocked(useSelectedClusters).mockReturnValue(['legacy', 'gang']);
    vi.spyOn(PodGroup, 'isEnabled').mockImplementation(async cluster => cluster === 'gang');

    const { result } = renderHook(() => useSchedulingApisEnabled(), { wrapper });

    await waitFor(() => expect(result.current).toBe(true));
  });
});

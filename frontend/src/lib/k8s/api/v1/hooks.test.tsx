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

import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CancellablePromise, useConnectApi } from './hooks';

vi.mock('../../../cluster', () => ({
  getCluster: vi.fn(() => 'my-cluster'),
  getSelectedClusters: vi.fn(() => []),
}));

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

type TestCall = () => CancellablePromise;

function createCall(name: string, started: string[]) {
  const cancel = vi.fn();
  const fn: TestCall = vi.fn(() => {
    started.push(name);
    return Promise.resolve(cancel);
  });
  return { fn, cancel, name };
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useConnectApi', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('supports the original single-call variadic form: useConnectApi(call)', async () => {
    const started: string[] = [];
    const { fn, cancel } = createCall('call-a', started);

    const { unmount } = renderHook(() => useConnectApi(fn), { wrapper });

    // The argument is used as an API call, not miscategorized.
    expect(fn).toHaveBeenCalledTimes(1);
    expect(started).toEqual(['call-a']);

    unmount();
    await flushMicrotasks();
    // The cancellable returned by the call is invoked on cleanup.
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('supports the original variadic form: useConnectApi(call1, call2)', async () => {
    const started: string[] = [];
    const call1 = createCall('call-1', started);
    const call2 = createCall('call-2', started);

    const { unmount } = renderHook(() => useConnectApi(call1.fn, call2.fn), { wrapper });

    // A legacy function argument must never be interpreted as a dependency
    // list: both arguments are invoked as API calls.
    expect(started).toEqual(['call-1', 'call-2']);

    unmount();
    await flushMicrotasks();
    // Both cancellables are invoked on cleanup.
    await waitFor(() => expect(call1.cancel).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(call2.cancel).toHaveBeenCalledTimes(1));
  });

  it('supports the dependency-aware form and re-runs when deps change', async () => {
    const started: string[] = [];
    const { fn, cancel } = createCall('dep-call', started);

    const { rerender } = renderHook(({ deps }: { deps: unknown[] }) => useConnectApi([fn], deps), {
      wrapper,
      initialProps: { deps: [1] },
    });

    expect(started).toEqual(['dep-call']);

    // Same deps value: no re-run nor cleanup.
    rerender({ deps: [1] });
    expect(fn).toHaveBeenCalledTimes(1);

    // Changed deps: the previous stream is cancelled, then the call re-runs.
    rerender({ deps: [2] });
    await flushMicrotasks();
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

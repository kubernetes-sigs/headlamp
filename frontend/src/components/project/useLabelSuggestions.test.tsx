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

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import DaemonSet from '../../lib/k8s/daemonSet';
import Deployment from '../../lib/k8s/deployment';
import ReplicaSet from '../../lib/k8s/replicaSet';
import StatefulSet from '../../lib/k8s/statefulSet';
import { useLabelSuggestions } from './useLabelSuggestions';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

function mockUseListReturn(items: any[], opts?: { isLoading?: boolean; error?: any }) {
  return {
    items,
    error: opts?.error ?? null,
    isLoading: opts?.isLoading ?? false,
    errors: opts?.error ? [opts.error] : null,
    isError: !!opts?.error,
    isFetching: false,
    isSuccess: !opts?.isLoading,
  } as any;
}

describe('useLabelSuggestions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty suggestions when no resources have app labels', () => {
    vi.spyOn(Deployment as any, 'useList').mockReturnValue(mockUseListReturn([]));
    vi.spyOn(ReplicaSet as any, 'useList').mockReturnValue(mockUseListReturn([]));
    vi.spyOn(StatefulSet as any, 'useList').mockReturnValue(mockUseListReturn([]));
    vi.spyOn(DaemonSet as any, 'useList').mockReturnValue(mockUseListReturn([]));

    const { result } = renderHook(() =>
      useLabelSuggestions({ clusters: ['c1'], namespaces: ['default'] })
    );

    expect(result.current.suggestions).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.errors).toEqual([]);
  });

  it('aggregates suggestions from different workload kinds and sorts by value', () => {
    vi.spyOn(Deployment as any, 'useList').mockReturnValue(
      mockUseListReturn([
        { metadata: { labels: { 'app.kubernetes.io/name': 'cart' } } },
        { metadata: { labels: { app: 'shop' } } },
      ])
    );
    vi.spyOn(ReplicaSet as any, 'useList').mockReturnValue(
      mockUseListReturn([{ metadata: { labels: { 'k8s-app': 'monitor' } } }])
    );
    vi.spyOn(StatefulSet as any, 'useList').mockReturnValue(mockUseListReturn([]));
    vi.spyOn(DaemonSet as any, 'useList').mockReturnValue(mockUseListReturn([]));

    const { result } = renderHook(() => useLabelSuggestions({ clusters: ['c1'] }));

    // Expect sorted by value: cart, monitor, shop
    expect(result.current.suggestions).toEqual([
      { label: 'app.kubernetes.io/name', value: 'cart' },
      { label: 'k8s-app', value: 'monitor' },
      { label: 'app', value: 'shop' },
    ]);
  });

  it('deduplicates by app name when multiple resources share the same value', () => {
    vi.spyOn(Deployment as any, 'useList').mockReturnValue(
      mockUseListReturn([{ metadata: { labels: { app: 'cart' } } }])
    );
    vi.spyOn(ReplicaSet as any, 'useList').mockReturnValue(
      mockUseListReturn([{ metadata: { labels: { 'app.kubernetes.io/name': 'cart' } } }])
    );
    vi.spyOn(StatefulSet as any, 'useList').mockReturnValue(mockUseListReturn([]));
    vi.spyOn(DaemonSet as any, 'useList').mockReturnValue(mockUseListReturn([]));

    const { result } = renderHook(() => useLabelSuggestions({ clusters: ['c1'] }));

    expect(result.current.suggestions).toHaveLength(1);
    expect(result.current.suggestions[0]).toEqual({ label: 'app', value: 'cart' });
  });

  it('combines loading state and errors from all lists', () => {
    const error = { status: 500, message: 'oops' } as any;

    vi.spyOn(Deployment as any, 'useList').mockReturnValue(
      mockUseListReturn([], { isLoading: true })
    );
    vi.spyOn(ReplicaSet as any, 'useList').mockReturnValue(mockUseListReturn([], { error }));
    vi.spyOn(StatefulSet as any, 'useList').mockReturnValue(mockUseListReturn([]));
    vi.spyOn(DaemonSet as any, 'useList').mockReturnValue(mockUseListReturn([]));

    const { result } = renderHook(() => useLabelSuggestions({ clusters: ['c1'] }));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.errors).toEqual([error]);
  });
});

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

import { act, renderHook } from '@testing-library/react';
import { jobSuspendKey, resetJobSuspendState, useJobSuspendState } from './jobSuspendState';

describe('jobSuspendState', () => {
  beforeEach(() => {
    resetJobSuspendState();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('scopes the key by cluster so identical Job UIDs across clusters do not collide', () => {
    const jobA: any = {
      cluster: 'cluster-a',
      metadata: { uid: 'same-uid', namespace: 'ns', name: 'job' },
    };
    const jobB: any = {
      cluster: 'cluster-b',
      metadata: { uid: 'same-uid', namespace: 'ns', name: 'job' },
    };

    expect(jobSuspendKey(jobA)).not.toBe(jobSuspendKey(jobB));

    // The name/namespace fallback (no UID) must also stay cluster-scoped.
    const noUidA: any = { cluster: 'cluster-a', metadata: { namespace: 'ns', name: 'job' } };
    const noUidB: any = { cluster: 'cluster-b', metadata: { namespace: 'ns', name: 'job' } };
    expect(jobSuspendKey(noUidA)).not.toBe(jobSuspendKey(noUidB));
  });

  it('keeps state for an unmounted, settled entry until the bounded cleanup window elapses', () => {
    const { result, unmount } = renderHook(() => useJobSuspendState('job-x'));

    act(() => {
      result.current[1]({ isPendingSuspend: true, optimisticSuspended: true });
    });
    // The action settles (patch resolved/failed/cancelled) but the watch hasn't confirmed yet.
    act(() => {
      result.current[1]({ isPendingSuspend: false });
    });

    unmount();

    // Still within the bounded window: a remount should see the optimistic value.
    act(() => {
      vi.advanceTimersByTime(29_000);
    });
    const { result: remounted, unmount: unmountRemounted } = renderHook(() =>
      useJobSuspendState('job-x')
    );
    expect(remounted.current[0].optimisticSuspended).toBe(true);
    unmountRemounted();

    // Past the bounded window with nobody watching: the entry is garbage collected.
    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    const { result: afterCleanup } = renderHook(() => useJobSuspendState('job-x'));
    expect(afterCleanup.current[0].optimisticSuspended).toBeNull();
  });

  it('expires a settled optimistic value after the bounded window even while still observed', () => {
    // If the watch never confirms our own patch (e.g. another client reverts the field first),
    // the optimistic override must not persist forever just because the button stays mounted.
    const { result } = renderHook(() => useJobSuspendState('job-y'));

    act(() => {
      result.current[1]({ isPendingSuspend: true, optimisticSuspended: true });
    });
    act(() => {
      result.current[1]({ isPendingSuspend: false });
    });

    // Still within the bounded window: the optimistic value is retained.
    act(() => {
      vi.advanceTimersByTime(29_000);
    });
    expect(result.current[0].optimisticSuspended).toBe(true);

    // Past the bounded window: it expires and falls back to the watched value, notifying
    // this still-mounted observer.
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current[0].optimisticSuspended).toBeNull();
  });

  it('does not let a stale cleanup timer delete a newer action on the same entry', () => {
    // Action A: mount, settle, unmount (unobserved), scheduling a 30s cleanup timer.
    const first = renderHook(() => useJobSuspendState('job-z'));
    act(() => {
      first.result.current[1]({ isPendingSuspend: true, optimisticSuspended: true });
    });
    act(() => {
      first.result.current[1]({ isPendingSuspend: false });
    });
    first.unmount();

    // Before A's timer fires, action B reuses the same entry (menu reopened, new action),
    // then also settles and goes unobserved again (scheduling its own, later timer).
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    const second = renderHook(() => useJobSuspendState('job-z'));
    act(() => {
      second.result.current[1]({ isPendingSuspend: true, optimisticSuspended: false });
    });
    act(() => {
      second.result.current[1]({ isPendingSuspend: false });
    });
    second.unmount();

    // Advance to when A's original (stale) timer would fire. It must not delete B's value.
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    const afterStaleTimer = renderHook(() => useJobSuspendState('job-z'));
    expect(afterStaleTimer.result.current[0].optimisticSuspended).toBe(false);
    afterStaleTimer.unmount();

    // B's own bounded window eventually cleans it up too.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    const afterOwnTimer = renderHook(() => useJobSuspendState('job-z'));
    expect(afterOwnTimer.result.current[0].optimisticSuspended).toBeNull();
  });
});

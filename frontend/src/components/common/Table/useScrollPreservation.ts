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

import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Preserves a scrollable element's vertical `scrollTop` across re-renders
 * triggered by a changing `data` reference.
 *
 * React Query hands us a fresh array on every poll, which can cause the
 * scroll container to jump back to the top even when the user has scrolled
 * down (kubernetes-sigs/headlamp#5701). The returned `ref`/`onScroll`
 * should be wired to the scroll container so the last observed position
 * can be reapplied after a data-driven re-render that zeroed it.
 *
 * Behavior notes:
 * - Restoration fires only when the container has just been reset to 0
 *   while a non-zero position was previously observed, so a user (or the
 *   caller) that intentionally scrolls to the top is not fought.
 * - The saved position is cleared when the container becomes unscrollable
 *   (e.g. data goes empty), so a later refill does not restore a position
 *   that no longer maps to what the user was looking at.
 * - Only vertical scroll is preserved; horizontal is intentionally not
 *   tracked.
 */
export function useScrollPreservationOnDataChange<T, E extends HTMLElement = HTMLDivElement>(
  data: T
) {
  const ref = useRef<E | null>(null);
  const savedScrollTop = useRef(0);

  const onScroll = useCallback((event: React.UIEvent<E>) => {
    savedScrollTop.current = event.currentTarget.scrollTop;
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // If the container isn't scrollable (data went empty, or is smaller than
    // the viewport), drop the saved position so a future refill doesn't
    // jump the user to a position from a previous dataset.
    if (el.scrollHeight <= el.clientHeight) {
      savedScrollTop.current = 0;
      return;
    }

    // Seed the saved position when the container is already scrolled but
    // no scroll event has recorded a value yet (e.g. hydration or deep
    // link put the user mid-list). Later scrolls refresh via `onScroll`.
    if (savedScrollTop.current === 0 && el.scrollTop > 0) {
      savedScrollTop.current = el.scrollTop;
      return;
    }

    if (savedScrollTop.current > 0 && el.scrollTop === 0) {
      el.scrollTop = savedScrollTop.current;
    }
  }, [data]);

  return { ref, onScroll };
}

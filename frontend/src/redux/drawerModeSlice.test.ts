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

import { beforeEach, describe, expect, it, vi } from 'vitest';

const SIDE_KEY = 'detailDrawerSide';
const ENABLED_KEY = 'detailDrawerEnabled';

async function loadFreshSlice() {
  // Re-import so the module reads initial values from the current
  // localStorage state, since `initialState` is captured at import time.
  vi.resetModules();
  return import('./drawerModeSlice');
}

describe('drawerModeSlice', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to right side when nothing is stored', async () => {
    const { drawerModeSlice } = await loadFreshSlice();
    expect(drawerModeSlice.getInitialState().detailDrawerSide).toBe('right');
  });

  it('falls back to right when localStorage holds an unknown value', async () => {
    localStorage.setItem(SIDE_KEY, 'top-left');
    const { drawerModeSlice } = await loadFreshSlice();
    expect(drawerModeSlice.getInitialState().detailDrawerSide).toBe('right');
  });

  it('hydrates each valid side from localStorage', async () => {
    for (const side of ['left', 'right', 'bottom'] as const) {
      localStorage.setItem(SIDE_KEY, side);
      const { drawerModeSlice } = await loadFreshSlice();
      expect(drawerModeSlice.getInitialState().detailDrawerSide).toBe(side);
    }
  });

  it('persists the new side to localStorage on setDetailDrawerSide', async () => {
    const { drawerModeSlice, setDetailDrawerSide } = await loadFreshSlice();
    const state = drawerModeSlice.reducer(
      drawerModeSlice.getInitialState(),
      setDetailDrawerSide('bottom')
    );
    expect(state.detailDrawerSide).toBe('bottom');
    expect(localStorage.getItem(SIDE_KEY)).toBe('bottom');
  });

  it('leaves detailDrawerSide untouched when toggling isDetailDrawerEnabled', async () => {
    localStorage.setItem(SIDE_KEY, 'left');
    const { drawerModeSlice, setDetailDrawerEnabled } = await loadFreshSlice();
    const state = drawerModeSlice.reducer(
      drawerModeSlice.getInitialState(),
      setDetailDrawerEnabled(false)
    );
    expect(state.detailDrawerSide).toBe('left');
    expect(state.isDetailDrawerEnabled).toBe(false);
    expect(localStorage.getItem(ENABLED_KEY)).toBe('false');
  });
});

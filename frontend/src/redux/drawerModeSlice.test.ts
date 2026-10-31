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

describe('drawerModeSlice', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('defaults to true when localStorage is empty', async () => {
      const { drawerModeSlice } = await import('./drawerModeSlice');
      const state = drawerModeSlice.getInitialState();
      expect(state.isDetailDrawerEnabled).toBe(true);
    });

    it('initializes to false when localStorage has "false"', async () => {
      localStorage.setItem('detailDrawerEnabled', 'false');
      const { drawerModeSlice } = await import('./drawerModeSlice');
      const state = drawerModeSlice.getInitialState();
      expect(state.isDetailDrawerEnabled).toBe(false);
    });

    it('initializes to true and logs warning when localStorage.getItem throws (e.g. SecurityError)', async () => {
      const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError: The operation is insecure.');
      });

      const { drawerModeSlice } = await import('./drawerModeSlice');
      const state = drawerModeSlice.getInitialState();

      expect(state.isDetailDrawerEnabled).toBe(true);
      expect(spyWarn).toHaveBeenCalledWith(
        'Failed to get detailDrawerEnabled from localStorage, defaulting to true:',
        expect.stringContaining('SecurityError: The operation is insecure.')
      );
    });
  });

  describe('setDetailDrawerEnabled', () => {
    it('updates state and writes to localStorage', async () => {
      const { drawerModeSlice, setDetailDrawerEnabled } = await import('./drawerModeSlice');
      let state = drawerModeSlice.getInitialState();

      state = drawerModeSlice.reducer(state, setDetailDrawerEnabled(false));

      expect(state.isDetailDrawerEnabled).toBe(false);
      expect(localStorage.getItem('detailDrawerEnabled')).toBe('false');
    });

    it('updates state and logs error when localStorage.setItem throws', async () => {
      const spyError = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('Quota exceeded');
      });

      const { drawerModeSlice, setDetailDrawerEnabled } = await import('./drawerModeSlice');
      let state = drawerModeSlice.getInitialState();

      state = drawerModeSlice.reducer(state, setDetailDrawerEnabled(false));

      expect(state.isDetailDrawerEnabled).toBe(false);
      expect(spyError).toHaveBeenCalledWith(
        'Failed to set detailDrawerEnabled in localStorage:',
        expect.stringContaining('Quota exceeded')
      );
    });
  });

  describe('setSelectedResource', () => {
    it('updates selectedResource in state', async () => {
      const { drawerModeSlice, setSelectedResource } = await import('./drawerModeSlice');
      let state = drawerModeSlice.getInitialState();
      const resource = { kind: 'Pod', metadata: { name: 'test' }, cluster: 'minikube' };

      state = drawerModeSlice.reducer(state, setSelectedResource(resource));

      expect(state.selectedResource).toEqual(resource);
    });
  });
});

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

import { vi } from 'vitest';

vi.mock('i18next', () => ({
  default: {
    t: (key: string) => key,
  },
}));

import reducer, {
  DEFAULT_SHORTCUTS,
  resetAllShortcuts,
  resetShortcut,
  setShortcut,
  setShortcutsDialogOpen,
  ShortcutsState,
} from './shortcutsSlice';

describe('shortcutsSlice', () => {
  const initialState: ShortcutsState = {
    shortcuts: { ...DEFAULT_SHORTCUTS },
    isShortcutsDialogOpen: false,
  };

  describe('setShortcut', () => {
    it('should update a shortcut key', () => {
      const newState = reducer(initialState, setShortcut({ id: 'GLOBAL_SEARCH', key: 'ctrl+k' }));

      expect(newState.shortcuts.GLOBAL_SEARCH.key).toBe('ctrl+k');
    });

    it('should not update non-existent shortcut', () => {
      const newState = reducer(initialState, setShortcut({ id: 'NON_EXISTENT', key: 'ctrl+x' }));

      expect(newState.shortcuts['NON_EXISTENT']).toBeUndefined();
    });
  });

  describe('resetShortcut', () => {
    it('should reset a shortcut to its default key', () => {
      let state = reducer(initialState, setShortcut({ id: 'GLOBAL_SEARCH', key: 'ctrl+k' }));
      expect(state.shortcuts.GLOBAL_SEARCH.key).toBe('ctrl+k');

      state = reducer(state, resetShortcut('GLOBAL_SEARCH'));
      expect(state.shortcuts.GLOBAL_SEARCH.key).toBe('/');
    });

    it('should not throw for non-existent shortcut', () => {
      const state = reducer(initialState, resetShortcut('NON_EXISTENT'));
      expect(state).toBeDefined();
    });
  });

  describe('resetAllShortcuts', () => {
    it('should reset all shortcuts to defaults', () => {
      let state = reducer(initialState, setShortcut({ id: 'GLOBAL_SEARCH', key: 'ctrl+k' }));
      state = reducer(state, setShortcut({ id: 'CLUSTER_CHOOSER', key: 'ctrl+shift+c' }));

      expect(state.shortcuts.GLOBAL_SEARCH.key).toBe('ctrl+k');
      expect(state.shortcuts.CLUSTER_CHOOSER.key).toBe('ctrl+shift+c');

      state = reducer(state, resetAllShortcuts());

      expect(state.shortcuts.GLOBAL_SEARCH.key).toBe('/');
      expect(state.shortcuts.CLUSTER_CHOOSER.key).toBe('ctrl+shift+l');
    });
  });

  describe('setShortcutsDialogOpen', () => {
    it('should open the dialog', () => {
      const newState = reducer(initialState, setShortcutsDialogOpen(true));
      expect(newState.isShortcutsDialogOpen).toBe(true);
    });

    it('should close the dialog', () => {
      const openState = { ...initialState, isShortcutsDialogOpen: true };
      const newState = reducer(openState, setShortcutsDialogOpen(false));
      expect(newState.isShortcutsDialogOpen).toBe(false);
    });
  });

  describe('default shortcuts', () => {
    it('should have GLOBAL_SEARCH shortcut with correct defaults', () => {
      expect(DEFAULT_SHORTCUTS.GLOBAL_SEARCH).toBeDefined();
      expect(DEFAULT_SHORTCUTS.GLOBAL_SEARCH.key).toBe('/');
      expect(DEFAULT_SHORTCUTS.GLOBAL_SEARCH.defaultKey).toBe('/');
      expect(DEFAULT_SHORTCUTS.GLOBAL_SEARCH.category).toBe('search');
      expect(DEFAULT_SHORTCUTS.GLOBAL_SEARCH.name).toBe('Global Search');
    });

    it('should have CLUSTER_CHOOSER shortcut with correct defaults', () => {
      expect(DEFAULT_SHORTCUTS.CLUSTER_CHOOSER).toBeDefined();
      expect(DEFAULT_SHORTCUTS.CLUSTER_CHOOSER.key).toBe('ctrl+shift+l');
      expect(DEFAULT_SHORTCUTS.CLUSTER_CHOOSER.category).toBe('navigation');
    });

    it('should have TABLE_COLUMN_FILTERS shortcut with correct defaults', () => {
      expect(DEFAULT_SHORTCUTS.TABLE_COLUMN_FILTERS).toBeDefined();
      expect(DEFAULT_SHORTCUTS.TABLE_COLUMN_FILTERS.key).toBe('alt+shift+t');
      expect(DEFAULT_SHORTCUTS.TABLE_COLUMN_FILTERS.category).toBe('general');
    });

    it('should have LOG_VIEWER_SEARCH shortcut with correct defaults', () => {
      expect(DEFAULT_SHORTCUTS.LOG_VIEWER_SEARCH).toBeDefined();
      expect(DEFAULT_SHORTCUTS.LOG_VIEWER_SEARCH.key).toBe('ctrl+shift+f');
      expect(DEFAULT_SHORTCUTS.LOG_VIEWER_SEARCH.category).toBe('search');
    });

    it('should have all shortcuts with required properties', () => {
      Object.values(DEFAULT_SHORTCUTS).forEach(shortcut => {
        expect(shortcut.id).toBeDefined();
        expect(shortcut.name).toBeDefined();
        expect(shortcut.description).toBeDefined();
        expect(shortcut.key).toBeDefined();
        expect(shortcut.defaultKey).toBeDefined();
        expect(shortcut.category).toBeDefined();
      });
    });
  });
});

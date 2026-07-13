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

import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

/**
 * Represents a keyboard shortcut configuration
 */
export interface ShortcutConfig {
  /** The unique identifier for the shortcut */
  id: string;
  /** The human-readable name of the shortcut */
  name: string;
  /** A description of what the shortcut does */
  description: string;
  /** The current key combination assigned to the shortcut */
  key: string;
  /** The default key combination for the shortcut */
  defaultKey: string;
  /** The category the shortcut belongs to */
  category: 'navigation' | 'search' | 'general';
}

import i18next from 'i18next';

/**
 * All available shortcuts with their default configurations
 */
export const DEFAULT_SHORTCUTS: Record<string, ShortcutConfig> = {
  GLOBAL_SEARCH: {
    id: 'GLOBAL_SEARCH',
    name: i18next.t('Global Search'),
    description: i18next.t('Open the global search dialog'),
    key: '/',
    defaultKey: '/',
    category: 'search',
  },
  CLUSTER_CHOOSER: {
    id: 'CLUSTER_CHOOSER',
    name: i18next.t('Cluster Chooser'),
    description: i18next.t('Open the cluster chooser popup'),
    key: 'ctrl+shift+l',
    defaultKey: 'ctrl+shift+l',
    category: 'navigation',
  },
  TABLE_COLUMN_FILTERS: {
    id: 'TABLE_COLUMN_FILTERS',
    name: i18next.t('Toggle Table Filters'),
    description: i18next.t('Toggle column filters in tables'),
    key: 'alt+shift+t',
    defaultKey: 'alt+shift+t',
    category: 'general',
  },
  LOG_VIEWER_SEARCH: {
    id: 'LOG_VIEWER_SEARCH',
    name: i18next.t('Log Viewer Search'),
    description: i18next.t('Toggle search in log viewer'),
    key: 'ctrl+shift+f',
    defaultKey: 'ctrl+shift+f',
    category: 'search',
  },
};

export interface ShortcutsState {
  shortcuts: Record<string, ShortcutConfig>;
  isShortcutsDialogOpen: boolean;
}

function loadStoredShortcuts(): Record<string, ShortcutConfig> {
  try {
    const stored = localStorage.getItem('keyboardShortcuts');
    if (stored) {
      const parsed = JSON.parse(stored);
      const merged = { ...DEFAULT_SHORTCUTS };
      for (const id in parsed) {
        if (merged[id]) {
          merged[id] = { ...merged[id], key: parsed[id].key };
        }
      }
      return merged;
    }
  } catch (e) {
    console.error('Failed to load keyboard shortcuts from localStorage:', e);
  }
  return { ...DEFAULT_SHORTCUTS };
}

const initialState: ShortcutsState = {
  shortcuts: loadStoredShortcuts(),
  isShortcutsDialogOpen: false,
};

export const shortcutsSlice = createSlice({
  name: 'shortcuts',
  initialState,
  reducers: {
    setShortcut(state, action: PayloadAction<{ id: string; key: string }>) {
      const { id, key } = action.payload;
      if (state.shortcuts[id]) {
        state.shortcuts[id] = { ...state.shortcuts[id], key };
        const toStore: Record<string, { key: string }> = {};
        for (const shortcutId in state.shortcuts) {
          toStore[shortcutId] = { key: state.shortcuts[shortcutId].key };
        }
        localStorage.setItem('keyboardShortcuts', JSON.stringify(toStore));
      }
    },
    resetShortcut(state, action: PayloadAction<string>) {
      const id = action.payload;
      if (state.shortcuts[id]) {
        state.shortcuts[id] = {
          ...state.shortcuts[id],
          key: state.shortcuts[id].defaultKey,
        };
        const toStore: Record<string, { key: string }> = {};
        for (const shortcutId in state.shortcuts) {
          toStore[shortcutId] = { key: state.shortcuts[shortcutId].key };
        }
        localStorage.setItem('keyboardShortcuts', JSON.stringify(toStore));
      }
    },
    resetAllShortcuts(state) {
      state.shortcuts = { ...DEFAULT_SHORTCUTS };
      localStorage.removeItem('keyboardShortcuts');
    },
    setShortcutsDialogOpen(state, action: PayloadAction<boolean>) {
      state.isShortcutsDialogOpen = action.payload;
    },
  },
});

export const { setShortcut, resetShortcut, resetAllShortcuts, setShortcutsDialogOpen } =
  shortcutsSlice.actions;

export default shortcutsSlice.reducer;

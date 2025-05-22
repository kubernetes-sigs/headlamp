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

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface TableFilterState {
  [tableId: string]: {
    columnFilters: {
      id: string;
      value: any;
    }[];
    globalFilter: string;
    sorting: {
      id: string;
      desc: boolean;
    }[];
  };
}

const STORAGE_KEY = 'headlamp_table_filters';

function loadPersistedState(): TableFilterState {
  try {
    const savedState = localStorage.getItem(STORAGE_KEY);
    return savedState ? JSON.parse(savedState) : {};
  } catch (e) {
    console.error('Failed to load persisted table filter state:', e);
    return {};
  }
}

function persistState(state: TableFilterState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to persist table filter state:', e);
  }
}

const initialState: TableFilterState = loadPersistedState();

const tableFilterSlice = createSlice({
  name: 'tableFilter',
  initialState,
  reducers: {
    setTableFilters(
      state,
      action: PayloadAction<{
        tableId: string;
        columnFilters: { id: string; value: any }[];
        globalFilter: string;
        sorting: { id: string; desc: boolean }[];
      }>
    ) {
      const { tableId, columnFilters, globalFilter, sorting } = action.payload;
      state[tableId] = {
        columnFilters,
        globalFilter,
        sorting,
      };
      persistState(state);
    },

    clearTableFilters(state, action: PayloadAction<string>) {
      const tableId = action.payload;
      delete state[tableId];
      persistState(state);
    },

    clearAllTableFilters(state) {
      Object.keys(state).forEach(key => delete state[key]);
      persistState(state);
    },
  },
});

export const { setTableFilters, clearTableFilters, clearAllTableFilters } = tableFilterSlice.actions;
export { tableFilterSlice };
export default tableFilterSlice.reducer;
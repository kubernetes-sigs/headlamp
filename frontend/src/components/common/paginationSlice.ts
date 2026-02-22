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

// tablePaginationSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface TablePaginationState {
  pageIndex: number;
}

const initialState: TablePaginationState = {
  pageIndex: 0,
};

const tablePaginationSlice = createSlice({
  name: 'tablePagination',
  initialState,
  reducers: {
    setPageIndex(state, action: PayloadAction<number>) {
      state.pageIndex = action.payload;
    },
  },
});

export const { setPageIndex } = tablePaginationSlice.actions;
export default tablePaginationSlice.reducer;

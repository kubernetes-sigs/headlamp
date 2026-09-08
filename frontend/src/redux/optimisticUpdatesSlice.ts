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

export type OptimisticAction = 'scale' | 'delete';

export interface OptimisticUpdate {
  uid: string;
  action: OptimisticAction;
  patch?: any;
}

export interface OptimisticUpdatesState {
  [uid: string]: OptimisticUpdate;
}

const initialState: OptimisticUpdatesState = {};

const optimisticUpdatesSlice = createSlice({
  name: 'optimisticUpdates',
  initialState,
  reducers: {
    addOptimisticUpdate: (state, action: PayloadAction<OptimisticUpdate>) => {
      state[action.payload.uid] = action.payload;
    },
    removeOptimisticUpdate: (state, action: PayloadAction<string>) => {
      delete state[action.payload];
    },
  },
});

export const { addOptimisticUpdate, removeOptimisticUpdate } = optimisticUpdatesSlice.actions;

export default optimisticUpdatesSlice.reducer;

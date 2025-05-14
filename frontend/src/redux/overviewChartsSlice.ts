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
import { ReactNode } from 'react';

export interface OverviewChart {
  id: string;
  component: () => ReactNode;
}

export interface OverviewChartsProcessor {
  id?: string;
  processor: (charts: OverviewChart[]) => OverviewChart[];
}

export interface OverviewChartsState {
  processors: OverviewChartsProcessor[];
}

const initialState: OverviewChartsState = {
  processors: [],
};

const overviewChartsSlice = createSlice({
  name: 'overviewCharts',
  initialState,
  reducers: {
    addProcessor: (state, action: PayloadAction<OverviewChartsProcessor>) => {
      state.processors.push(action.payload);
    },
  },
});

export const { addProcessor: addOverviewChartsProcessor } = overviewChartsSlice.actions;
export default overviewChartsSlice.reducer;

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

import { createSlice } from '@reduxjs/toolkit';
import getAllDocDefinitions from '../components/common/DefinitionToolTip/Util';

type DefinitionsObject = Record<string, any>;

export interface DocsState {
  allDocs: Promise<DefinitionsObject> | null;
}

const initialState: DocsState = {
  allDocs: null,
};

const docsSlice = createSlice({
  name: 'docs',
  initialState,
  reducers: {
    /**
     * Adds or updates a route in the state.
     */
    // setRoute(state, action: PayloadAction<Route>) {
    //   state.routes[action.payload.path] = action.payload;
    // },

    getAllDocs(state) {
      const docDefinitions = getAllDocDefinitions();
      state.allDocs = docDefinitions;
    },
  },
});

export const { getAllDocs } = docsSlice.actions;

export { docsSlice };
export default docsSlice.reducer;

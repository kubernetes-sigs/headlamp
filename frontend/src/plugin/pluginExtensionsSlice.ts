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

export type PluginExtension = {
  id: string;
};

export interface PluginExtensionsState {
  extensions: Record<string, Record<string, PluginExtension>>;
}

const initialState: PluginExtensionsState = {
  extensions: Object.create(null) as Record<string, Record<string, PluginExtension>>,
};

const pluginExtensionsSlice = createSlice({
  name: 'pluginExtensions',
  initialState,
  reducers: {
    addPluginExtension(
      state,
      action: PayloadAction<{ extensionPoint: string; value: PluginExtension }>
    ) {
      const { extensionPoint, value } = action.payload;
      if (!state.extensions[extensionPoint]) {
        state.extensions[extensionPoint] = Object.create(null) as Record<string, PluginExtension>;
      }

      state.extensions[extensionPoint][value.id] = value;
    },
    resetPluginExtensions(state) {
      state.extensions = Object.create(null) as Record<string, Record<string, PluginExtension>>;
    },
  },
});

export const { addPluginExtension, resetPluginExtensions } = pluginExtensionsSlice.actions;
export default pluginExtensionsSlice.reducer;

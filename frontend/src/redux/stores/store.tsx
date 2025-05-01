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

import { configureStore } from '@reduxjs/toolkit';
import { initialState as CLUSTER_ACTIONS_INITIAL_STATE } from '../clusterActionSlice';
import { initialState as CLUSTER_PROVIDER_INITIAL_STATE } from '../clusterProviderSlice';
import { initialState as CONFIG_INITIAL_STATE } from '../configSlice';
import { initialState as FILTER_INITIAL_STATE } from '../filterSlice';
import { listenerMiddleware } from '../headlampEventSlice';
import reducers from '../reducers/reducers';
import { INITIAL_STATE as UI_INITIAL_STATE } from '../reducers/ui';

const store = configureStore({
  reducer: reducers,
  preloadedState: {
    filter: FILTER_INITIAL_STATE,
    ui: UI_INITIAL_STATE,
    config: CONFIG_INITIAL_STATE,
    clusterAction: CLUSTER_ACTIONS_INITIAL_STATE,
    clusterProvider: CLUSTER_PROVIDER_INITIAL_STATE,
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: false,
      thunk: true,
    }).prepend(listenerMiddleware.middleware),
});

export default store;

export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof store.getState>;
export type AppStore = typeof store;

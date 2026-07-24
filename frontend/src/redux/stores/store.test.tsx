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
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { activityReducer, activitySlice } from '../../components/activity/activitySlice';
import resourceTableReducer, {
  addResourceTableColumnsProcessor,
} from '../../components/common/Resource/resourceTableSlice';
import type { Route } from '../../lib/router/Route';
import pluginsReducer, { setPluginSettingsComponent } from '../../plugin/pluginsSlice';
import filterReducer, { setNamespaceFilter } from '../filterSlice';
import eventCallbackReducer, { addEventCallback, listenerMiddleware } from '../headlampEventSlice';
import routesReducer, { setRoute, setRouteFilter } from '../routesSlice';
import { serializableCheckOptions } from './store';

const unrelatedSlice = createSlice({
  name: 'unrelated',
  initialState: {
    value: null as unknown,
  },
  reducers: {
    setValue(state, action: PayloadAction<unknown>) {
      state.value = action.payload;
    },
  },
});

function createTestStore() {
  return configureStore({
    reducer: {
      filter: filterReducer,
      routes: routesReducer,
      resourceTable: resourceTableReducer,
      eventCallbackReducer,
      plugins: pluginsReducer,
      activity: activityReducer,
      unrelated: unrelatedSlice.reducer,
    },
    middleware: getDefaultMiddleware =>
      getDefaultMiddleware({
        serializableCheck: serializableCheckOptions,
      }).prepend(listenerMiddleware.middleware),
  });
}

function consoleErrorCallsContain(consoleErrorSpy: ReturnType<typeof vi.spyOn>, expected: string) {
  return consoleErrorSpy.mock.calls.some(call => call.some(arg => String(arg).includes(expected)));
}

describe('store serializable middleware', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows known route and event callback registrations without disabling the guard globally', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = createTestStore();
    const route: Route = {
      path: '/test',
      component: () => <div>Test</div>,
      sidebar: null,
    };
    const processor = () => [];
    const routeFilter = (candidate: Route) => candidate;
    const eventCallback = () => {};
    const PluginSettings = () => <div>Plugin settings</div>;
    const activityContent = <div>Activity</div>;

    store.dispatch(setNamespaceFilter(['default']));
    store.dispatch(setRoute(route));
    store.dispatch(setRouteFilter(routeFilter));
    store.dispatch(addResourceTableColumnsProcessor(processor));
    store.dispatch(addEventCallback(eventCallback));
    store.dispatch(
      setPluginSettingsComponent({
        name: 'plugin',
        component: PluginSettings,
        displaySaveButton: true,
      })
    );
    store.dispatch(
      activitySlice.actions.launchActivity({
        id: 'activity',
        title: 'Activity',
        icon: null,
        location: 'full',
        content: activityContent,
      })
    );
    store.dispatch(activitySlice.actions.update({ id: 'activity', content: activityContent }));
    store.dispatch(unrelatedSlice.actions.setValue('serializable'));

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('still reports unrelated non-serializable state updates', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = createTestStore();
    const nonSerializableValue = () => null;

    store.dispatch(unrelatedSlice.actions.setValue(nonSerializableValue));

    expect(
      consoleErrorCallsContain(
        consoleErrorSpy,
        'A non-serializable value was detected in an action'
      )
    ).toBe(true);
    expect(consoleErrorCallsContain(consoleErrorSpy, 'unrelated/setValue')).toBe(true);
    expect(
      consoleErrorCallsContain(
        consoleErrorSpy,
        'A non-serializable value was detected in the state'
      )
    ).toBe(true);
  });
});

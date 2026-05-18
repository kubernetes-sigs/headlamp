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
import type { Route } from '../lib/router/Route';
import routesReducer, { setRoute, setRouteFilter } from './routesSlice';

describe('routesSlice', () => {
  let store = configureStore({
    reducer: {
      routes: routesReducer,
    },
  });

  beforeEach(() => {
    store = configureStore({
      reducer: {
        routes: routesReducer,
      },
    });
  });

  describe('setRoute', () => {
    it('should add a new route to the state', () => {
      const testRoute: Route = {
        path: '/test',
        component: () => <div>Test</div>,
        sidebar: null,
      };
      store.dispatch(setRoute(testRoute));

      const savedRoute = store.getState().routes.routes['/test'];
      expect(savedRoute).toEqual(testRoute);
    });

    it('should update an existing route in the state', () => {
      const initialRoute: Route = {
        path: '/test',
        component: () => <div>Initial</div>,
        sidebar: null,
      };
      const updatedRoute: Route = {
        path: '/test',
        component: () => <div>Updated</div>,
        sidebar: null,
      };

      store.dispatch(setRoute(initialRoute));
      store.dispatch(setRoute(updatedRoute));

      const savedRoute = store.getState().routes.routes['/test'];
      expect(savedRoute).toEqual(updatedRoute);
    });
  });

  describe('setRouteFilter', () => {
    it('should add a new route filter to the state', () => {
      const testFilter = (route: Route) => route;
      store.dispatch(setRouteFilter(testFilter));

      const savedFilters = store.getState().routes.routeFilters;
      expect(savedFilters).toContain(testFilter);
    });
  });
});

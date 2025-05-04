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
import { Route } from '../lib/router';

export interface RoutesState {
  /**
   * The routes in the application. Keyed by the route path, value is the route.
   */
  routes: { [path: string]: Route };
  /**
   * The route filters in the application. That is remove routes from routes.
   */
  routeFilters: ((route: Route) => Route | null)[];
}

const initialState: RoutesState = {
  routes: {},
  routeFilters: [],
};

const routesSlice = createSlice({
  name: 'routes',
  initialState,
  reducers: {
    /**
     * Adds or updates a route in the state.
     */
    setRoute(state, action: PayloadAction<Route>) {
      state.routes[action.payload.path] = action.payload;
    },

    /**
     * Adds a route filter function to the routeFilters array in the state.
     *
     * The filter functions can be used elsewhere in the application to filter
     * routes based on certain conditions.
     */
    setRouteFilter(state, action: PayloadAction<(route: Route) => Route | null>) {
      state.routeFilters.push(action.payload);
    },
  },
});

export const { setRoute, setRouteFilter } = routesSlice.actions;

export { routesSlice };
export default routesSlice.reducer;

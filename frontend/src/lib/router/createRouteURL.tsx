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

import { generatePath } from 'react-router';
import type { AppStore } from '../../redux/stores/store';
import { getClusterPathParam } from '../cluster';
import { getRoute } from './getRoute';
import { getRoutePath } from './getRoutePath';
import { getRouteUseClusterURL } from './getRouteUseClusterURL';

export interface RouteURLProps {
  /**
   * Selected clusters path parameter
   *
   * Check out {@link getClusterPathParam} and {@link formatClusterPathParam} function
   * for working with this parameter
   */
  cluster?: string;
  [prop: string]: any;
}

var theStore: { store: AppStore | null } | undefined = { store: null };

function getStore() {
  return theStore?.store ?? null;
}
/**
 * This is so we can access the store from anywhere, but not import it directly.
 * @param newStore
 */
export function setStore(newStore: AppStore) {
  if (!theStore) {
    // Initialize theStore if this module hasn't finished evaluating yet (avoids TDZ on circular imports)
    theStore = { store: newStore };
  } else {
    theStore.store = newStore;
  }
}

export function createRouteURL(routeName: string, params: RouteURLProps = {}) {
  const store = getStore();
  const storeRoutes = !store ? {} : store.getState().routes.routes;

  // First try to find by name
  const matchingStoredRouteByName =
    storeRoutes &&
    Object.entries(storeRoutes).find(
      ([, route]) => route.name?.toLowerCase() === routeName.toLowerCase()
    )?.[1];

  // Then try to find by path
  const matchingStoredRouteByPath =
    storeRoutes &&
    Object.entries(storeRoutes).find(([key]) => key.toLowerCase() === routeName.toLowerCase())?.[1];

  if (matchingStoredRouteByPath && !matchingStoredRouteByName) {
    console.warn(
      `[Deprecation] Route "${routeName}" was found by path instead of name. ` +
        'Please use route names instead of paths when calling createRouteURL.'
    );
  }

  const route = matchingStoredRouteByName || matchingStoredRouteByPath || getRoute(routeName);

  if (!route) {
    return '';
  }

  let cluster = params.cluster;
  if (!cluster && getRouteUseClusterURL(route)) {
    cluster = getClusterPathParam();
    if (!cluster) {
      return '/';
    }
  }
  const fullParams = {
    selected: undefined,
    ...params,
  };

  // Add cluster to the params if it is not already there
  if (!fullParams.cluster && !!cluster) {
    fullParams.cluster = cluster;
  }

  // @todo: Remove this hack once we support redirection in routes
  if (routeName === 'settingsCluster') {
    return `/settings/cluster?c=${fullParams.cluster}`;
  }

  const url = getRoutePath(route);
  return generatePath(url, fullParams);
}

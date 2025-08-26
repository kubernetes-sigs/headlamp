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

import { getClusterPrefixedPath } from '../cluster';
import { NotFoundRoute } from '.';
import { getRouteUseClusterURL } from './getRouteUseClusterURL';
import type { Route } from './Route';

export function getRoutePath(route: Route) {
  if (route.path === NotFoundRoute.path) {
    return route.path;
  }
  if (!getRouteUseClusterURL(route)) {
    return route.path;
  }

  return getClusterPrefixedPath(route.path);
}

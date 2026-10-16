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

import { getDefaultRoutes } from './getDefaultRoutes';

/**
 * Mapping of deprecated route names to their current equivalents.
 * Keys are lower-cased so the lookup is always case-insensitive.
 */
const DEPRECATED_ROUTE_ALIASES: Record<string, string> = {
  clusterroles: 'roles',
  clusterrolebindings: 'roleBindings',
};

export function getRoute(routeName?: string) {
  if (!routeName) return;

  let targetRouteName = routeName;

  // Resolve deprecated aliases case-insensitively so Router.getRoute('clusterRoles'),
  // Router.getRoute('ClusterRoles'), etc. all continue to work.
  const lowerName = routeName.toLowerCase();
  if (DEPRECATED_ROUTE_ALIASES[lowerName] !== undefined) {
    console.warn(
      `[Deprecation] Route name "${routeName}" is deprecated. ` +
        `Please use "${DEPRECATED_ROUTE_ALIASES[lowerName]}" instead.`
    );
    targetRouteName = DEPRECATED_ROUTE_ALIASES[lowerName];
  }

  let routeKey = targetRouteName;
  for (const key in getDefaultRoutes()) {
    if (key.toLowerCase() === targetRouteName.toLowerCase()) {
      routeKey = key;
      break;
    }
  }
  return getDefaultRoutes()[routeKey];
}

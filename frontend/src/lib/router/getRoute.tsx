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
 * Created with Object.assign(Object.create(null), ...) to restrict lookups to own properties
 * and avoid prototype poisoning or matching Object.prototype methods (e.g. toString).
 */
const DEPRECATED_ROUTE_ALIASES: Record<string, string> = Object.assign(Object.create(null), {
  clusterroles: 'roles',
  clusterrolebindings: 'roleBindings',
});

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

  const routes = getDefaultRoutes();
  for (const key of Object.keys(routes)) {
    if (key.toLowerCase() === targetRouteName.toLowerCase()) {
      return routes[key];
    }
  }

  return undefined;
}

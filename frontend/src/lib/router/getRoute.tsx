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

import { debugLog } from '.';
import { getDefaultRoutes } from './getDefaultRoutes';

export function getRoute(routeName?: string) {
  if (!routeName) {
    debugLog('error', 'routeName is undefined/null/empty in getRoute');
    return;
  }

  let routeKey = routeName;
  for (const key in getDefaultRoutes()) {
    if (!key || typeof key !== 'string') {
      debugLog('warn', 'Invalid key in defaultRoutes:', key);
      continue;
    }

    try {
      if (key.toLowerCase() === routeName.toLowerCase()) {
        // if (key !== routeName) {
        //   console.warn(`Route name ${routeName} and ${key} are not matching`);
        // }
        routeKey = key;
        break;
      }
    } catch (error) {
      debugLog(
        'error',
        'Error in toLowerCase comparison:',
        error,
        'key:',
        key,
        'routeName:',
        routeName
      );
    }
  }
  return getDefaultRoutes()[routeKey];
}

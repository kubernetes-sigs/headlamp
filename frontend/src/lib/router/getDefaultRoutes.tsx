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

import { Route } from './Route';

/** @private */
const DEFAULT_ROUTES: { [routeName: string]: Route } = {};

export function getDefaultRoutes() {
  return DEFAULT_ROUTES;
}

export function setDefaultRoutes(routes: { [routeName: string]: Route }) {
  // remove all existing keys
  Object.keys(DEFAULT_ROUTES).forEach(k => {
    delete DEFAULT_ROUTES[k];
  });

  // copy in the new routes
  Object.assign(DEFAULT_ROUTES, routes);
}

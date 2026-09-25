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

/**
 * Integration-style regression test for the xbackendtrafficpolicy route key.
 *
 * The unit tests in createRouteURL.test.ts mock getRoute, so they cannot
 * catch a misspelled key in the real default-route registry. This test
 * imports the actual registered routes and verifies that the key exists
 * and resolves to the expected URL pattern.
 *
 * The route key uses the 'x' prefix because the Kubernetes resource kind
 * is XBackendTrafficPolicy (Gateway API experimental), and getRoute()
 * resolves detailsRoute (which returns the kind) via case-insensitive
 * key matching.
 */

// Side-effect import: executing index.tsx calls setDefaultRoutes(defaultRoutes),
// which populates the real route registry used by getDefaultRoutes().
import './index';
import { describe, expect, it } from 'vitest';
import { getDefaultRoutes } from './getDefaultRoutes';

describe('xbackendtrafficpolicy route registration (regression for route key)', () => {
  it('has an xbackendtrafficpolicy key in the default routes', () => {
    const routes = getDefaultRoutes();
    expect(routes).toHaveProperty('xbackendtrafficpolicy');
  });

  it('resolves to the expected path pattern', () => {
    const routes = getDefaultRoutes();
    expect(routes['xbackendtrafficpolicy'].path).toBe('/backendtrafficpolicy/:namespace/:name');
  });
});

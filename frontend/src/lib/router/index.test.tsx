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

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';

const mockHistoryReplace = vi.fn();
const { mockUseCluster } = vi.hoisted(() => ({ mockUseCluster: vi.fn<() => string | null>() }));

vi.mock('react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useHistory: () => ({ replace: mockHistoryReplace }),
}));

vi.mock('../k8s', async importOriginal => ({
  ...(await importOriginal<typeof import('../k8s')>()),
  useCluster: () => mockUseCluster(),
}));

import { getDefaultRoutes } from './index';

describe('lib/router/index', () => {
  describe('the registered default routes', () => {
    const routes = getDefaultRoutes();
    const entries = Object.entries(routes);

    it('registers a non-trivial number of routes', () => {
      // Loosely guards against the whole table being accidentally cleared or
      // not registered (e.g. setDefaultRoutes not being called).
      expect(entries.length).toBeGreaterThan(50);
    });

    it.each(entries)('route "%s" has a valid path, component and sidebar', (_name, route) => {
      expect(route.path).toMatch(/^\//);

      // `<route.component />` needs a function/class component or a lazy, memo or
      // forwardRef component (an object tagged with `$$typeof`). Other objects, such as
      // `{}` or an already created JSX element, would fail when the route is opened.
      const component = route.component as any;
      if (typeof component !== 'function') {
        expect([
          Symbol.for('react.lazy'),
          Symbol.for('react.memo'),
          Symbol.for('react.forward_ref'),
        ]).toContain(component?.$$typeof);
      }

      if (typeof route.sidebar === 'string') {
        expect(route.sidebar.length).toBeGreaterThan(0);
      } else if (route.sidebar && typeof route.sidebar === 'object') {
        expect(typeof route.sidebar.sidebar).toBe('string');
        expect(route.sidebar.sidebar.length).toBeGreaterThan(0);
        if (route.sidebar.item !== null) {
          expect(typeof route.sidebar.item).toBe('string');
          expect(route.sidebar.item.length).toBeGreaterThan(0);
        }
      } else {
        expect(route.sidebar).toBeNull();
      }
    });
  });

  describe('SettingsClusterRedirect', () => {
    it('redirects to the current cluster settings page', () => {
      mockUseCluster.mockReturnValue('my-cluster');
      const SettingsClusterRedirect = getDefaultRoutes().settingsCluster.component;

      render(
        <TestContext>
          <SettingsClusterRedirect />
        </TestContext>
      );

      expect(mockHistoryReplace).toHaveBeenCalledWith('/settings/cluster?c=my-cluster');
    });

    it('includes the cluster name as-is, even if it is empty', () => {
      mockUseCluster.mockReturnValue('');
      const SettingsClusterRedirect = getDefaultRoutes().settingsCluster.component;

      render(
        <TestContext>
          <SettingsClusterRedirect />
        </TestContext>
      );

      expect(mockHistoryReplace).toHaveBeenCalledWith('/settings/cluster?c=');
    });
  });
});

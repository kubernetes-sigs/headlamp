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

import './index';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppStore } from '../../redux/stores/store';
import { createRouteURL, setStore } from './createRouteURL';
import { getDefaultRoutes, setDefaultRoutes } from './getDefaultRoutes';
import { getRoute } from './getRoute';
import { getRoutePath } from './getRoutePath';
import { getRouteUseClusterURL } from './getRouteUseClusterURL';
import { NotFoundRoute } from './notFoundRoute';
import type { Route } from './Route';

describe('router helpers', () => {
  const originalRoutes = { ...getDefaultRoutes() };

  afterEach(() => {
    setDefaultRoutes(originalRoutes);
    setStore(undefined as unknown as AppStore);
    window.history.pushState({}, '', '/');
    vi.restoreAllMocks();
  });

  describe('getRoute', () => {
    it('returns undefined when no route name is passed', () => {
      expect(getRoute()).toBeUndefined();
      expect(getRoute('')).toBeUndefined();
    });

    it('looks up registered routes case-insensitively', () => {
      expect(getRoute('pods')).toBe(originalRoutes.Pods);
      expect(getRoute('PODS')).toBe(originalRoutes.Pods);
    });

    it('returns undefined for an unknown route', () => {
      expect(getRoute('nonExistentRoute')).toBeUndefined();
    });
  });

  describe('getRouteUseClusterURL', () => {
    const baseRoute: Route = {
      path: '/example',
      name: 'Example',
      sidebar: null,
      component: () => <div />,
    };

    it('defaults to true when neither useClusterURL nor noCluster is set', () => {
      expect(getRouteUseClusterURL(baseRoute)).toBe(true);
    });

    it('returns explicit useClusterURL values', () => {
      expect(getRouteUseClusterURL({ ...baseRoute, useClusterURL: false })).toBe(false);
      expect(getRouteUseClusterURL({ ...baseRoute, useClusterURL: true })).toBe(true);
    });

    it('falls back to deprecated noCluster with a warning when useClusterURL is undefined', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(getRouteUseClusterURL({ ...baseRoute, noCluster: false })).toBe(true);
      expect(getRouteUseClusterURL({ ...baseRoute, noCluster: true })).toBe(false);
      expect(warnSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('getRoutePath', () => {
    it('returns NotFoundRoute path without cluster prefix', () => {
      expect(getRoutePath(NotFoundRoute)).toBe('*');
    });

    it('returns route.path directly when useClusterURL is false', () => {
      expect(
        getRoutePath({
          path: '/settings/general',
          name: 'Settings',
          sidebar: null,
          useClusterURL: false,
          component: () => <div />,
        })
      ).toBe('/settings/general');
    });

    it('prefixes route.path with /c/:cluster when useClusterURL is enabled', () => {
      expect(
        getRoutePath({
          path: '/pods',
          name: 'Pods',
          sidebar: 'pods',
          component: () => <div />,
        })
      ).toBe('/c/:cluster/pods');
    });
  });

  describe('NotFoundRoute and setDefaultRoutes', () => {
    it('renders a valid React element from NotFoundRoute.component', () => {
      const element = NotFoundRoute.component();
      expect(React.isValidElement(element)).toBe(true);
    });

    it('replaces default routes via setDefaultRoutes', () => {
      const customRoute: Route = {
        path: '/custom',
        name: 'Custom',
        sidebar: null,
        component: () => <div />,
      };
      setDefaultRoutes({ custom: customRoute });

      expect(Object.keys(getDefaultRoutes())).toEqual(['custom']);
      expect(getRoute('custom')).toBe(customRoute);
    });
  });

  describe('createRouteURL with store and cluster path resolution', () => {
    it('resolves store routes by name and warns when matched only by key/path', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const storeRoutes: Record<string, Route> = {
        '/custom-plugin/:item': {
          path: '/custom-plugin/:item',
          name: 'CustomPluginName',
          sidebar: null,
          useClusterURL: false,
          component: () => <div />,
        },
      };

      setStore({
        getState: () => ({ routes: { routes: storeRoutes } }),
      } as unknown as AppStore);

      expect(createRouteURL('custompluginname', { item: 'alpha' })).toBe('/custom-plugin/alpha');
      expect(warnSpy).not.toHaveBeenCalled();

      expect(createRouteURL('/custom-plugin/:item', { item: 'beta' })).toBe('/custom-plugin/beta');
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('resolves cluster from current URL path when omitted and falls back to "/" when absent', () => {
      expect(createRouteURL('pods')).toBe('/');

      window.history.pushState({}, '', '/c/dev-cluster/nodes');
      expect(createRouteURL('pods')).toBe('/c/dev-cluster/pods');
    });

    it('generates the query-based redirect URL for settingsCluster', () => {
      expect(createRouteURL('settingsCluster', { cluster: 'prod' })).toBe(
        '/settings/cluster?c=prod'
      );
    });
  });
});

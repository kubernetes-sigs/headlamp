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

import { useCallback } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { createRouteURL } from '../../lib/router/createRouteURL';
import { useShortcut } from '../../lib/useShortcut';
import { useNamespaces } from '../../redux/filterSlice';

export function buildResourceListTarget(opts: {
  pathname: string;
  namespaces: string[];
  currentSearch: string;
  namespaced?: boolean;
}): { pathname: string; search: string } {
  const params = new URLSearchParams(opts.currentSearch);
  if (opts.namespaced !== false && opts.namespaces.length > 0) {
    params.set('namespace', opts.namespaces.join(' '));
  } else {
    params.delete('namespace');
  }
  const s = params.toString();
  return { pathname: opts.pathname, search: s ? `?${s}` : '' };
}

export default function ResourceShortcuts() {
  const history = useHistory();
  const { search: currentSearch } = useLocation();
  const namespaces = useNamespaces();

  const navigate = useCallback(
    (routeName: string) => {
      const pathname = createRouteURL(routeName);
      if (!pathname || pathname === '/') {
        return;
      }
      const target = buildResourceListTarget({
        pathname,
        namespaces,
        currentSearch,
        namespaced: true,
      });
      if (
        history.location.pathname === target.pathname &&
        history.location.search === target.search
      ) {
        return;
      }
      history.push(target);
    },
    [history, namespaces, currentSearch]
  );

  useShortcut('NAVIGATE_TO_PODS', () => navigate('Pods'), undefined, [navigate]);
  useShortcut('NAVIGATE_TO_DEPLOYMENTS', () => navigate('Deployments'), undefined, [navigate]);

  return null;
}

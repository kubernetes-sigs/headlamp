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

import { useHistory } from 'react-router-dom';
import { useTypedSelector } from '../redux/hooks';
import { createRouteURL } from './router/createRouteURL';
import { useShortcut } from './useShortcut';

interface NavShortcut {
  shortcutId: string;
  routeName: string;
}

const NAV_SHORTCUTS: NavShortcut[] = [
  { shortcutId: 'NAVIGATE_PODS', routeName: 'Pods' },
  { shortcutId: 'NAVIGATE_DEPLOYMENTS', routeName: 'Deployments' },
  { shortcutId: 'NAVIGATE_SERVICES', routeName: 'services' },
  { shortcutId: 'NAVIGATE_JOBS', routeName: 'Jobs' },
  { shortcutId: 'NAVIGATE_CRONJOBS', routeName: 'CronJobs' },
];

export function useGlobalNavigationShortcuts() {
  const history = useHistory();
  const filter = useTypedSelector(state => state.filter);

  for (const { shortcutId, routeName } of NAV_SHORTCUTS) {
    useShortcut(
      shortcutId,
      () => {
        const url = createRouteURL(routeName);
        if (!url) return;

        const namespaces = [...filter.namespaces];
        const search = namespaces.length > 0 ? `?namespace=${namespaces.join(' ')}` : undefined;

        history.push({ pathname: url, search });
      },
      { preventDefault: true },
      [history, filter.namespaces, routeName]
    );
  }
}

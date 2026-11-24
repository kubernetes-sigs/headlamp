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

import { History } from 'history';
import {
  createContext,
  PropsWithChildren,
  useEffect,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { Router, useLocation } from 'react-router-dom';
import { getSelectedClusters } from '../../lib/cluster';
import { createClusterHistory } from '../../lib/router/clusterHistory';
import { ClusterPreOpenOverlay } from './ClusterPreOpenGate';
import { useClusterPreOpen } from './useClusterPreOpen';

/** Suppresses automatic redirects through preparation and the Router handoff. */
export const ClusterNavigationPendingContext = createContext(false);

function ClusterNavigation({
  navigation,
  children,
}: PropsWithChildren<{ navigation: ReturnType<typeof createClusterHistory> }>) {
  const pending = useSyncExternalStore(navigation.subscribe, navigation.getPending);
  const routerLocation = useLocation();
  // Retain committed B before the destination observer can move to reentrant C.
  // The gate may not render B until after its gcTime: 0 eviction would have run.
  // History is synchronous even when React's Router context has not caught up.
  const committedClusters = getSelectedClusters([], navigation.history.location.pathname);
  useClusterPreOpen(committedClusters);
  const clusters = pending ? getSelectedClusters([], pending.location.pathname) : committedClusters;
  const preOpen = useClusterPreOpen(clusters);

  useEffect(() => {
    if (pending && (!preOpen.enabled || preOpen.isSuccess)) {
      navigation.commit(pending);
    }
  }, [navigation, pending, preOpen.enabled, preOpen.isSuccess]);

  return (
    <ClusterNavigationPendingContext.Provider
      value={pending !== null || routerLocation !== navigation.history.location}
    >
      {children}
      {pending && <ClusterPreOpenOverlay cluster={clusters[0]} preOpen={preOpen} />}
    </ClusterNavigationPendingContext.Provider>
  );
}

/** Prepares navigation while keeping mounted sessions on the committed cluster. */
export default function ClusterRouter({
  history,
  children,
}: PropsWithChildren<{ history: History }>) {
  const navigation = useMemo(() => createClusterHistory(history), [history]);
  useLayoutEffect(() => navigation.start(), [navigation]);

  return (
    <Router history={navigation.history}>
      <ClusterNavigation navigation={navigation}>{children}</ClusterNavigation>
    </Router>
  );
}

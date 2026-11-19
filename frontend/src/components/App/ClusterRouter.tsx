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

import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import { History } from 'history';
import {
  PropsWithChildren,
  useEffect,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Router } from 'react-router-dom';
import { getSelectedClusters } from '../../lib/cluster';
import { createClusterHistory } from '../../lib/router/clusterHistory';
import { ClusterPreOpenStatus } from './ClusterPreOpenGate';
import { useClusterPreOpen } from './useClusterPreOpen';

function ClusterNavigation({
  navigation,
  children,
}: PropsWithChildren<{ navigation: ReturnType<typeof createClusterHistory> }>) {
  const pending = useSyncExternalStore(navigation.subscribe, navigation.getPending);
  const { t } = useTranslation();
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
    <>
      {children}
      {pending &&
        (preOpen.isError ? (
          <Dialog open maxWidth="sm" fullWidth aria-label={t('translation|Could not open cluster')}>
            <DialogContent>
              <ClusterPreOpenStatus cluster={clusters[0]} preOpen={preOpen} />
            </DialogContent>
          </Dialog>
        ) : (
          <ClusterPreOpenStatus cluster={clusters[0]} preOpen={preOpen} />
        ))}
    </>
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

/*
 * Copyright 2026 The Kubernetes Authors
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

import { createSelector } from '@reduxjs/toolkit';
import { isEqual } from 'lodash';
import { useSyncExternalStore } from 'react';
import type { RootState } from '../../../../redux/stores/store';
import store from '../../../../redux/stores/store';
export { withDiscoveryConnectionRevision } from './discoveryConnection';

// A removed registration cannot match a backend-generated routing revision.
const removedDiscoveryRevision = 'removed';

const selectConfiguredRevisions = createSelector(
  (state: RootState) => state.config.clusters,
  clusters =>
    new Map(
      Object.values(clusters ?? {}).map(cluster => [
        cluster.name,
        cluster.meta_data?.discoveryOrigin
          ? cluster.meta_data.discoveryConnectionRevision ?? ''
          : null,
      ])
    ),
  { memoizeOptions: { resultEqualityCheck: isEqual } }
);

let configuredRevisions = new Map<string, string | null>();
let localRevisions = new Map<string, string>();
let nextLocalRevision = 0;
let stopTrackingRevisions: (() => void) | undefined;

function updateDiscoveryRevisions() {
  const current = selectConfiguredRevisions(store.getState());
  if (current !== configuredRevisions) {
    // Revisiting an earlier endpoint must fetch fresh data and start a new watch.
    const revisions = new Map<string, string>();
    for (const [cluster, revision] of current) {
      if (revision === null) continue;
      const previous = revision === configuredRevisions.get(cluster) && localRevisions.get(cluster);
      revisions.set(cluster, previous || (revision ? `${revision}:${++nextLocalRevision}` : ''));
    }
    for (const cluster of localRevisions.keys()) {
      if (!current.has(cluster)) {
        revisions.set(cluster, removedDiscoveryRevision);
      }
    }
    configuredRevisions = current;
    localRevisions = revisions;
  }
}

function getDiscoveryRevisions() {
  // Query caches can outlive their views. Track every transition after the first
  // use, even when nothing is mounted to observe updates to the store.
  stopTrackingRevisions ??= store.subscribe(updateDiscoveryRevisions);
  updateDiscoveryRevisions();
  return localRevisions;
}

import.meta.hot?.dispose(() => stopTrackingRevisions?.());

export function getDiscoveredConnectionRevision(cluster: string) {
  return getDiscoveryRevisions().get(cluster);
}

export function useDiscoveredConnectionRevisions() {
  return useSyncExternalStore(store.subscribe, getDiscoveryRevisions);
}

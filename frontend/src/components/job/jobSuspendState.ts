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

import { useCallback, useSyncExternalStore } from 'react';
import type Job from '../../lib/k8s/job';

type Listener = () => void;

export interface JobSuspendState {
  isPendingSuspend: boolean;
  optimisticSuspended: boolean | null;
}

/**
 * Stable identity for a Job's suspend state. Includes the cluster because a Kubernetes UID is
 * only unique within a cluster, and the name/namespace fallback can collide across the clusters
 * combined in a multi-cluster Jobs list — either would otherwise let one Job inherit another's
 * pending/optimistic state.
 */
export function jobSuspendKey(item: Job): string {
  const withinCluster = item.metadata.uid ?? `${item.metadata.namespace}/${item.metadata.name}`;
  return `${item.cluster ?? ''}/${withinCluster}`;
}

interface StateEntry {
  value: JobSuspendState;
  listeners: Set<Listener>;
}

const idleState: JobSuspendState = { isPendingSuspend: false, optimisticSuspended: null };

// Row-action menu items unmount as soon as the menu closes, which would otherwise discard
// local pending/optimistic state while clusterAction's cancellation window is still open.
// Keeping it here, keyed by Job UID, lets it survive menu close/reopen (and remounts in
// general) until the watch reflects the change or the action fails/cancels.
const entries = new Map<string, StateEntry>();

// Once a suspend/resume action settles, bound how long its optimistic value can override the
// watched one. This applies whether or not the button is currently observed: if the watch never
// exposes the optimistic value (e.g. another client reverts the field first, or the button is
// simply left unmounted), the override must not persist indefinitely and cause the next click to
// act on the wrong target state, or the entry to leak for the rest of the session.
const OPTIMISTIC_EXPIRY_MS = 30_000;

function getEntry(uid: string): StateEntry {
  let entry = entries.get(uid);
  if (!entry) {
    entry = { value: idleState, listeners: new Set() };
    entries.set(uid, entry);
  }
  return entry;
}

function pruneIfIdle(uid: string, entry: StateEntry) {
  if (entry.value === idleState && entry.listeners.size === 0) {
    entries.delete(uid);
  }
}

function scheduleOptimisticExpiry(uid: string, entry: StateEntry) {
  if (entry.value === idleState || entry.value.isPendingSuspend) {
    return;
  }
  // Capture the exact value this timer was scheduled for. A newer action on the same Job
  // (reusing this StateEntry), or the watch catching up first, always produces a new value
  // object, so if the entry has moved on since scheduling, this stale timer must be a no-op.
  const valueAtSchedule = entry.value;
  setTimeout(() => {
    const current = entries.get(uid);
    if (current === entry && current.value === valueAtSchedule) {
      // Falls back to the watched value and notifies any observers, and doubles as garbage
      // collection (via pruneIfIdle in updateState) when nobody is watching any more.
      updateState(uid, { optimisticSuspended: null });
    }
  }, OPTIMISTIC_EXPIRY_MS);
}

function subscribe(uid: string, listener: Listener) {
  const entry = getEntry(uid);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
    pruneIfIdle(uid, entry);
  };
}

function updateState(uid: string, patch: Partial<JobSuspendState>) {
  const entry = getEntry(uid);
  const wasPending = entry.value.isPendingSuspend;
  const next = { ...entry.value, ...patch };
  entry.value = next.isPendingSuspend || next.optimisticSuspended !== null ? next : idleState;

  for (const listener of entry.listeners) {
    listener();
  }
  pruneIfIdle(uid, entry);

  // The action just settled (pending -> not pending). Bound how long its optimistic value
  // may override the watched one, whether or not anyone is currently watching this Job.
  if (wasPending && !next.isPendingSuspend) {
    scheduleOptimisticExpiry(uid, entry);
  }
}

/**
 * Tracks a Job's pending/optimistic suspend state outside of React component state, keyed
 * by Job UID, so it survives the component being unmounted and remounted (e.g. a row-action
 * menu item closing and reopening) while a suspend/resume request is in flight.
 */
export function useJobSuspendState(uid: string) {
  const subscribeToEntry = useCallback((listener: Listener) => subscribe(uid, listener), [uid]);
  const getSnapshot = useCallback(() => getEntry(uid).value, [uid]);
  const state = useSyncExternalStore(subscribeToEntry, getSnapshot, getSnapshot);
  const setState = useCallback((patch: Partial<JobSuspendState>) => updateState(uid, patch), [uid]);

  return [state, setState] as const;
}

/** Test-only: clears all tracked state so test cases don't leak into one another. */
export function resetJobSuspendState() {
  entries.clear();
}

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

import { Action, createLocation, History, Location, LocationListener } from 'history';
import { hasClusterPreOpenHooks } from '../../plugin/clusterPreOpen';
import { getSelectedClusters } from '../cluster';
import { registerClusterLocation } from './clusterLocation';

interface PendingNavigation {
  location: Location;
  action: Action;
  complete: () => void;
}

/**
 * Keeps the router and URL-defaulted API helpers on the last prepared location.
 * PUSH/REPLACE wait before touching browser history. POP has already changed the
 * address bar, so it waits before publishing the new selected location instead.
 * No history blocking, index bookkeeping, or POP reversal is needed.
 */
export function createClusterHistory(browserHistory: History) {
  let location = browserHistory.location;
  let action = browserHistory.action;
  let pending: PendingNavigation | null = null;
  let committing = false;
  let listening = false;
  const listeners = new Set<LocationListener>();
  const pendingListeners = new Set<() => void>();

  function notifyPending() {
    pendingListeners.forEach(listener => listener());
  }

  function publish(nextLocation: Location, nextAction: Action) {
    location = nextLocation;
    action = nextAction;
    listeners.forEach(listener => listener(location, action));
  }

  function write(next: Location, replace: boolean) {
    const previous = browserHistory.location;
    if (replace) {
      browserHistory.replace(next);
    } else {
      browserHistory.push(next);
    }
    // Redirect mounts can navigate before the parent's layout effect starts
    // listening. React Router already subscribes during its constructor.
    if (!listening && browserHistory.location !== previous) {
      publish(browserHistory.location, browserHistory.action);
    }
  }

  function navigate(nextLocation: Location, nextAction: Action, complete: () => void) {
    const clusters = getSelectedClusters([], nextLocation.pathname);
    const currentClusters = getSelectedClusters([], location.pathname);
    const needsPreparation =
      hasClusterPreOpenHooks() &&
      clusters.length === 1 &&
      (currentClusters.length !== 1 || clusters[0] !== currentClusters[0]);

    pending = needsPreparation ? { location: nextLocation, action: nextAction, complete } : null;
    if (!needsPreparation) {
      complete();
    }
    notifyPending();
  }

  const history: History = {
    ...browserHistory,
    get location() {
      return location;
    },
    get action() {
      return action;
    },
    get length() {
      return browserHistory.length;
    },
    push(path, state) {
      const next = createLocation(path, state, undefined, location);
      navigate(next, 'PUSH', () => write(next, false));
    },
    replace(path, state) {
      const next = createLocation(path, state, undefined, location);
      navigate(next, 'REPLACE', () => write(next, true));
    },
    listen(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return {
    history,
    getPending: () => pending,
    subscribe(listener: () => void) {
      pendingListeners.add(listener);
      return () => {
        pendingListeners.delete(listener);
      };
    },
    commit(target: PendingNavigation) {
      if (pending !== target) {
        return;
      }
      committing = true;
      try {
        target.complete();
      } finally {
        committing = false;
        if (pending === target) {
          pending = null;
        }
        notifyPending();
      }
    },
    start() {
      const unregister = registerClusterLocation(() => location.pathname);
      listening = true;
      const unlisten = browserHistory.listen((next, nextAction) => {
        if (committing) {
          publish(next, nextAction);
        } else {
          navigate(next, nextAction, () => publish(next, nextAction));
        }
      });
      return () => {
        listening = false;
        unlisten();
        unregister();
      };
    },
  };
}

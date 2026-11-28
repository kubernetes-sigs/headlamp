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

import {
  Action,
  createLocation,
  History,
  Location,
  LocationDescriptor,
  LocationListener,
  locationsAreEqual,
} from 'history';
import { getSelectedClusters } from '../cluster';
import { registerClusterLocation } from './clusterLocation';

interface PendingNavigation {
  location: Location;
  action: Action;
  complete: () => void;
}

function isDecodedLocation(path: LocationDescriptor): path is Location {
  return (
    typeof path !== 'string' &&
    typeof path.pathname === 'string' &&
    typeof path.search === 'string' &&
    typeof path.hash === 'string' &&
    'state' in path
  );
}

/**
 * Keeps the router and URL-defaulted API helpers on the last prepared location.
 * PUSH/REPLACE wait before touching browser history. POP has already changed the
 * address bar, so it waits before publishing the new selected location instead.
 * No history blocking, index bookkeeping, or POP reversal is needed.
 */
export function createClusterHistory(browserHistory: History) {
  const usesHashHistory = browserHistory.createHref({ pathname: '/' }).includes('#');
  let location = browserHistory.location;
  let observedLocation = location;
  let action = browserHistory.action;
  let pending: PendingNavigation | null = null;
  let committing = false;
  let listening = false;
  let writing: Location | null = null;
  const writtenLocations = new WeakMap<Location, Location>();
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
    // history v4 decodes its input before writing it to the DOM URL.
    const encoded = { ...next, pathname: encodeURI(encodeURI(next.pathname)) };
    writing = next;
    try {
      if (replace) {
        browserHistory.replace(encoded);
      } else {
        browserHistory.push(encoded);
      }
      if (browserHistory.location !== previous) {
        const normalized = normalizeWrittenLocation(browserHistory.location);
        // Redirect mounts can navigate before the parent's layout effect listens.
        if (!listening) {
          observedLocation = normalized;
          publish(normalized, browserHistory.action);
        }
      }
    } finally {
      writing = null;
    }
  }

  function normalizeWrittenLocation(next: Location): Location {
    if (writing) {
      const normalized = { ...next, pathname: writing.pathname };
      writtenLocations.set(next, normalized);
      return normalized;
    }
    // Memory histories reuse entries on POP; DOM histories decode their URL anew.
    return writtenLocations.get(next) ?? next;
  }

  function navigate(nextLocation: Location, nextAction: Action, complete: () => void) {
    const clusters = getSelectedClusters([], nextLocation.pathname);
    const currentClusters = getSelectedClusters([], location.pathname);
    const needsPreparation =
      clusters.length === 1 && (currentClusters.length !== 1 || clusters[0] !== currentClusters[0]);

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
    createHref(next) {
      return browserHistory.createHref(
        isDecodedLocation(next) ? { ...next, pathname: encodeURI(next.pathname) } : next
      );
    },
    push(path, state) {
      // Full locations from React Router/history have already been decoded.
      const descriptor = isDecodedLocation(path)
        ? { ...path, pathname: encodeURI(path.pathname) }
        : path;
      const next = createLocation(descriptor, state, undefined, location);
      navigate(next, 'PUSH', () => write(next, false));
    },
    replace(path, state) {
      const descriptor = isDecodedLocation(path)
        ? { ...path, pathname: encodeURI(path.pathname) }
        : path;
      const next = createLocation(descriptor, state, undefined, location);
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
      const unlisten = browserHistory.listen((rawNext, nextAction) => {
        const next = normalizeWrittenLocation(rawNext);
        const previousObserved = observedLocation;
        observedLocation = next;
        // Hash writes emit a decoded POP without persisted state. It must not
        // supersede a newer pending destination when the URL has not changed.
        if (
          usesHashHistory &&
          nextAction === 'POP' &&
          locationsAreEqual({ ...next, state: previousObserved.state }, previousObserved)
        ) {
          return;
        }
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

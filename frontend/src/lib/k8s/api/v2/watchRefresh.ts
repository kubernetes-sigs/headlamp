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

import type { QueryClient, QueryKey } from '@tanstack/react-query';

const activeRefreshes = new WeakMap<object, Promise<void>>();
const eventRefreshes = new WeakMap<object, Promise<void>>();

export function isWatchRefresh(cacheEntry?: object) {
  return !!cacheEntry && activeRefreshes.has(cacheEntry);
}

/** A socket event requires a read after that event, shared by its subscribers. */
export function refreshWatchQuery(
  client: QueryClient,
  queryKey: QueryKey,
  event?: object,
  beforeRead?: () => void
): Promise<void> {
  const filters = { queryKey, exact: true };
  const cacheEntry = client.getQueryCache().find(filters);
  if (!cacheEntry) return Promise.resolve();

  const pending = event ? eventRefreshes.get(event) : activeRefreshes.get(cacheEntry);
  if (pending) return pending;

  // A request already in flight may have started before recovery was marked.
  void client.cancelQueries(filters);
  beforeRead?.();

  const request = Promise.resolve().then(async () => {
    cacheEntry.invalidate();
    // QueryClient.refetchQueries resolves early for paused queries. The query's
    // own fetch stays pending until the network returns or the read is canceled.
    if (cacheEntry.isActive()) await cacheEntry.fetch(undefined, { cancelRefetch: false });
  });
  activeRefreshes.set(cacheEntry, request);
  if (event) eventRefreshes.set(event, request);

  const finished = () => {
    if (activeRefreshes.get(cacheEntry) === request) activeRefreshes.delete(cacheEntry);
  };
  void request.then(finished, finished);
  return request;
}

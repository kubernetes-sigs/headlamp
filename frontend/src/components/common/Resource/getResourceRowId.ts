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

export interface IdentifiableResource {
  cluster?: string;
  metadata?: {
    uid?: string;
    namespace?: string;
    name?: string;
  };
}

/**
 * Returns a stable row identifier for a resource list table. Prefers
 * `metadata.uid` (set by the API server for any persisted Kubernetes object)
 * and falls back to a `cluster/namespace/name` composite so rows backed by
 * resources without a uid (events, virtual rows, synthetic items) still have
 * a key that is stable across polling refreshes (#5707).
 *
 * `index` is the row index passed by Material React Table, used as a
 * last-resort unique tiebreaker so anonymous rows (null/empty input, or items
 * with no identifying metadata) don't collapse onto a single id.
 */
export function getResourceRowId(
  item: IdentifiableResource | null | undefined,
  index?: number
): string {
  const fallback = `row-${index ?? 0}`;
  if (!item) return fallback;
  const uid = item.metadata?.uid;
  if (uid) return uid;
  const cluster = item.cluster ?? '';
  const namespace = item.metadata?.namespace ?? '';
  const name = item.metadata?.name ?? '';
  if (!cluster && !namespace && !name) return fallback;
  return `${cluster}/${namespace}/${name}`;
}

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

/**
 * Minimal shape `getResourceRowId` needs from a row. `KubeObject` (and any
 * test fixture mimicking it) satisfies this structurally, so the helper can
 * stand in for Material React Table's `getRowId` without the table data
 * type being narrowed to a Kubernetes-specific class.
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
 * last-resort unique tiebreaker so anonymous rows (items with no identifying
 * metadata) don't collapse onto a single id.
 *
 * Although Material React Table's documented contract passes a non-null row,
 * the previous implementation used optional chaining on `item?.metadata?.uid`
 * and therefore tolerated a sparse data array (e.g. `[item1, null, item3]`)
 * or a programmer error without crashing. We preserve that safety by
 * accepting `null | undefined` and falling back to the index in that case.
 *
 * Known limitation: if `metadata.uid` is absent in one fetch and arrives in
 * a later one, the id transitions from the composite to the uid and the row
 * will be re-created by MRT. This is a narrower window than the original
 * bug (where every refresh of a uid-less row reset selection) but still
 * loses selection during that specific transition; the broader fix would
 * be to pin a single id basis per row lifetime, which is out of scope here.
 *
 * Known limitation: two rows that share `cluster/namespace/name` but lack a
 * uid will collide on the composite key. Kubernetes' own uniqueness rules
 * make this impossible for real persisted objects (name is unique within a
 * namespace, and namespace is part of the composite), so the collision can
 * only occur for synthetic/virtual rows that the caller must disambiguate.
 */
export function getResourceRowId(
  item: IdentifiableResource | null | undefined,
  index: number
): string {
  if (!item) return `row-${index}`;
  const uid = item.metadata?.uid;
  if (uid) return uid;
  const name = item.metadata?.name ?? '';
  // `name` is the only field that uniquely identifies a row in the
  // composite: cluster alone is a many-to-one bucket and namespace alone
  // is meaningless without a name. Without `name`, the composite would
  // collapse into a single id (`prod//`, `/default/`, etc.) and every
  // such row in the table would collide. Fall back to the row index in
  // that case so anonymous rows stay distinct.
  if (!name) return `row-${index}`;
  const cluster = item.cluster ?? '';
  const namespace = item.metadata?.namespace ?? '';
  return `${cluster}/${namespace}/${name}`;
}

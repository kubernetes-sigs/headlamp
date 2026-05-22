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

import { compare as jsonPatchCompare, type Operation } from 'fast-json-patch';
import type { OpPatch } from 'json-patch';
import cloneDeep from 'lodash/cloneDeep';
import type { KubeObjectInterface } from './KubeObject';

/** The six standard RFC 6902 operation types. */
const STANDARD_OPS = new Set(['add', 'remove', 'replace', 'move', 'copy', 'test']);

/** Returns true if the operation is a standard RFC 6902 op (excludes fast-json-patch's `_get`). */
function isStandardOp(op: Operation): op is Operation & OpPatch {
  return STANDARD_OPS.has(op.op);
}

/** Paths for server-managed fields that should be excluded from user-initiated patches. */
function isServerManagedPath(path: string): boolean {
  return (
    path === '/metadata/resourceVersion' ||
    path === '/metadata/managedFields' ||
    path.startsWith('/metadata/managedFields/') ||
    path === '/metadata/generation' ||
    path === '/status' ||
    path.startsWith('/status/')
  );
}

/**
 * Computes RFC 6902 JSON Patch operations between two resource objects,
 * filtering out server-managed fields (resourceVersion, managedFields,
 * generation, status) which the server manages and would reintroduce
 * the 409 conflict the patch is meant to avoid.
 *
 * Also filters non-standard operations (e.g. fast-json-patch's `_get`)
 * to ensure only valid RFC 6902 ops are sent to the API server.
 */
export function computePatchOperations(
  original: KubeObjectInterface,
  modified: KubeObjectInterface
): OpPatch[] {
  const allOps = jsonPatchCompare(original, modified);
  return allOps.filter(op => isStandardOp(op) && !isServerManagedPath(op.path)) as OpPatch[];
}

/**
 * Returns a clone of the given resource with `metadata.managedFields` stripped.
 *
 * `EditorDialog` hides `metadata.managedFields` by default (the
 * `hideManagedFields` localStorage flag defaults to `true`). The object the
 * user saves therefore typically omits `managedFields` even when no edits
 * were made. If the original baseline still has them, the JSON diff will
 * contain a `remove /metadata/managedFields` op for an unchanged save.
 *
 * Strip them up front so the baseline matches what the editor presents to
 * the user, and "open + save without changes" produces a true empty diff.
 */
export function normalizeBaselineForPatch(obj: KubeObjectInterface): KubeObjectInterface {
  const normalized = cloneDeep(obj);
  if (normalized.metadata) {
    delete (normalized.metadata as { managedFields?: unknown }).managedFields;
  }
  return normalized;
}

/**
 * Returns the total number of raw diff operations between two objects,
 * ignoring `/metadata/managedFields` diffs (which are produced as a
 * side-effect of `EditorDialog`'s default "Hide Managed Fields" rendering
 * and do not represent user-intent changes).
 *
 * Used to distinguish "no changes at all" from "all changes were in
 * server-managed fields".
 */
export function computeRawPatchCount(
  original: KubeObjectInterface,
  modified: KubeObjectInterface
): number {
  return jsonPatchCompare(original, modified).filter(
    op => op.path !== '/metadata/managedFields' && !op.path.startsWith('/metadata/managedFields/')
  ).length;
}

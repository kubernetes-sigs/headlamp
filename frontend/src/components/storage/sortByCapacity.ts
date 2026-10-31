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

import type PersistentVolumeClaim from '../../lib/k8s/persistentVolumeClaim';
import { parseDiskSpace } from '../../lib/units';

/**
 * Compares two Kubernetes quantity strings by their size in bytes.
 * Missing or empty values sort first.
 */
export function compareCapacity(a?: string, b?: string): number {
  return parseDiskSpace(a ?? '') - parseDiskSpace(b ?? '');
}

/**
 * Sorts claims by their actual capacity in bytes, so 500Mi comes before 1Gi.
 * Claims without a capacity yet (for example Pending ones) sort first.
 */
export function sortByCapacity(a: PersistentVolumeClaim, b: PersistentVolumeClaim) {
  return compareCapacity(a.status?.capacity?.storage, b.status?.capacity?.storage);
}

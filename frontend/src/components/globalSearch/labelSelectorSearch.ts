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

import { validateLabelSelector } from '../../lib/labelSelectorValidation';

const explicitSelectorSyntax = /(?:!=|==|=|>|<|^!|\s+(?:in|notin)\s*\()/;

/**
 * Returns an explicit, valid Kubernetes label selector from a global search query.
 * Bare existence selectors are intentionally excluded because they are indistinguishable from
 * ordinary resource-name searches.
 *
 * @param query - Global search text.
 * @returns The trimmed selector, or `null` when the query is not an unambiguous valid selector.
 */
export function parseGlobalSearchLabelSelector(query: string): string | null {
  const selector = query.trim();
  if (!selector || !explicitSelectorSyntax.test(selector)) {
    return null;
  }

  return validateLabelSelector(selector) === null ? selector : null;
}

/**
 * Builds list options for global Kubernetes resource searches.
 *
 * @param inACluster - Whether global search currently has a selected cluster.
 * @param labelSelector - Optional validated selector to pass directly to Kubernetes.
 * @returns Options for `KubeObject.useList`.
 */
export function makeGlobalSearchListOptions(
  inACluster: boolean,
  labelSelector: string | null
): {
  clusters: string[] | undefined;
  fetchAllRequests?: boolean;
  labelSelector?: string;
  limit?: number;
} {
  return {
    clusters: inACluster ? undefined : [],
    ...(labelSelector ? { fetchAllRequests: true, labelSelector, limit: 1 } : {}),
  };
}
